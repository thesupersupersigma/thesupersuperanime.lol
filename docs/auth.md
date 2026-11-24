# Sign-in methods

**In plain English:** every way of signing in is **off until you configure it**. With nothing configured the site
still works: visitors watch as guests, and their progress stays in their browser. Each method below needs a few
values in `.env`; restart the site after changing them (`docker compose up -d`). The sign-in page shows only what is
switched on.

Accounts are handled by [Better Auth](https://www.better-auth.com) 1.7. Everything is stored in the site's own
Postgres database; nothing is sent to a third party except the provider you sign in with.

In the callback URLs below, `SITE_URL` is your site's public address exactly as in `.env` (for example
`https://anime.example.com`, no trailing slash). **The callback path is always `/api/auth/callback/<provider>`.**

| Method | Turns on when | Callback URL |
| --- | --- | --- |
| Email + password | `SMTP_*` is set, or `AUTH_EMAIL_ALLOW_UNVERIFIED=true` | (none) |
| Discord | `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` | `SITE_URL/api/auth/callback/discord` |
| Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | `SITE_URL/api/auth/callback/google` |
| GitHub | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | `SITE_URL/api/auth/callback/github` |
| Microsoft | `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` (+ `MICROSOFT_TENANT_ID`) | `SITE_URL/api/auth/callback/microsoft` |
| Passkeys | always, for anyone with an account | (none) |
| Two-step verification | always, for accounts with a password | (none) |

Setting only one of a pair (an ID without its secret) stops the site at startup with a clear error.

## Email + password

- **With SMTP** (recommended; see [self-hosting.md](self-hosting.md#email-smtp)): new accounts confirm their email
  through a link, people can reset a forgotten password, and two-step verification can also send codes by email.
- **Without SMTP**: set `AUTH_EMAIL_ALLOW_UNVERIFIED=true`. Anyone can sign up with any address, nobody's email is
  confirmed, and **forgotten passwords can't be reset**. The site logs a warning at startup. Fine for a private site
  among friends.
- Passwords found in known data breaches are refused (Have I Been Pwned; only the first 5 characters of the
  password's SHA-1 hash leave your server). `AUTH_BREACHED_PASSWORD_CHECK=false` turns that off.
- `AUTH_NEW_SIGNIN_EMAIL=true` (needs SMTP) emails people whenever their account signs in.

## Discord

1. <https://discord.com/developers/applications> → **New Application**, give it your site's name.
2. **OAuth2** → **Redirects** → add `SITE_URL/api/auth/callback/discord` → Save.
3. Copy **Client ID**, then **Reset Secret** and copy the secret.
4. `.env`: `DISCORD_CLIENT_ID=…` and `DISCORD_CLIENT_SECRET=…`

## Google

1. <https://console.cloud.google.com> → create (or pick) a project.
2. **Google Auth Platform** (OAuth consent screen) → set it up: app name, support email, audience **External**.
   Scopes: the defaults (`openid`, `email`, `profile`) are all the site asks for. While the app is in "Testing", only
   test users you list can sign in; **Publish** it to open it to everyone (no review needed for these scopes).
3. **Clients** (APIs & Services → Credentials) → **Create client** → type **Web application**.
   - Authorized JavaScript origins: `SITE_URL`
   - Authorized redirect URIs: `SITE_URL/api/auth/callback/google`
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## GitHub

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**
   (an organization's settings work too).
2. Homepage URL: `SITE_URL` · Authorization callback URL: `SITE_URL/api/auth/callback/github` → Register.
3. Copy the **Client ID**, then **Generate a new client secret** and copy it.
4. `.env`: `GITHUB_CLIENT_ID=…` and `GITHUB_CLIENT_SECRET=…`

## Microsoft (personal and work/school accounts)

1. <https://entra.microsoft.com> → **App registrations** → **New registration**.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (this matches
   the default `MICROSOFT_TENANT_ID=common`). Redirect URI: platform **Web**, `SITE_URL/api/auth/callback/microsoft`.
3. Copy the **Application (client) ID**.
4. **Certificates & secrets** → **New client secret** → copy its **Value** (not the Secret ID). Secrets expire (24
   months at most); put a reminder in your calendar to make a new one.
5. `.env`: `MICROSOFT_CLIENT_ID=…`, `MICROSOFT_CLIENT_SECRET=…`. Optional `MICROSOFT_TENANT_ID`: `common` (both
   kinds of account), `consumers` (personal only), `organizations` (work/school only) or your tenant's ID (one company).

Accounts are identified by Microsoft's `oid` claim (the stable account ID), as Better Auth 1.7 does by default.
Microsoft profile photos are stored inline, so no extra image host is needed.

## Passkeys

Anyone with an account can add passkeys in **Settings → Security** (fingerprint, face, screen lock or a security
key) and then sign in with one, including from the browser's autofill in the email field. Adding one needs a sign-in
within the last day.

- Passkeys are bound to the **host name of `SITE_URL`**. If you move the site to a new domain, existing passkeys stop
  working there (people sign in another way and add a new one).
- Browsers only allow passkeys on `https://` sites and on `http://localhost`.

## Two-step verification (2FA)

Accounts **with a password** can turn it on in Settings → Security: an authenticator app (TOTP, scanned from a QR code
or typed as a key; the app shows `SITE_NAME`) plus 10 one-time **backup codes**, shown once (they can be regenerated).
With SMTP set, the 2FA step can also send a code by email instead.

**Which sign-ins it covers** (checked in Better Auth 1.7.28's code, `plugins/two-factor`: the check hooks only the
`/sign-in/email`, `/sign-in/username` and `/sign-in/phone-number` endpoints; this site uses only the first):

| Sign-in | Asks for the 2FA code? |
| --- | --- |
| Email + password | **yes** |
| Passkey | no (a passkey is already two factors: the device plus its fingerprint/PIN) |
| Discord / Google / GitHub / Microsoft | no (the provider's own 2FA protects that sign-in) |
| Clicking the email-confirmation link (sign-up) | no (it signs in right after confirming a new address) |

That's why the 2FA section only appears for accounts that have a password. "Trust this device" skips the code on that
browser for 30 days. After 10 wrong codes in a row the account's 2FA step locks for 15 minutes.

## Linking accounts

In **Settings → Security → Linked accounts** a signed-in person can link or unlink any enabled provider (the last way
to sign in can't be removed). Linking also happens automatically when someone signs in with a provider whose email
matches an existing account, **but only if the provider says the email is verified and the existing account's email
is verified too** (Better Auth's defaults, kept on purpose: otherwise someone could pre-register a victim's address).

## Rate limits and client IPs

Sign-in, sign-up, password changes and email sending are rate-limited per IP (3 tries per 10 seconds; 3 reset or
verification emails per minute), stored in the database so limits survive restarts and work across replicas. The IP
comes from the connection itself, or from `CLIENT_IP_HEADER` (default `X-Forwarded-For`) **only** when the connection
comes from an address in `TRUSTED_PROXIES`. Behind a reverse proxy, set `TRUSTED_PROXIES`, or every visitor shares the
proxy's IP and its limits.
