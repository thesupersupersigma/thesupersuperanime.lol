# Self-hosting

**In plain English:** the site runs as five containers that one `docker compose up -d` starts together: the
**site** itself, one **Postgres** (holding two databases: the site's accounts/progress and RECONSUMΣT.TS's anime
catalog), and RECONSUMΣT.TS's **API** (anime data and streams) and **relay** (which carries video to viewers). You
need four secrets in a `.env` file and nothing else. To put it on the internet you add HTTPS in front: the bundled
Caddy (automatic certificates) or the reverse proxy you already run. Video goes out through **your** upload, so your
upload speed decides how many people can watch at once (RECONSUMΣT.TS's
[self-hosting guide](https://github.com/thesupersupersigma/RECONSUMET.TS/blob/master/docs/self-hosting.md) explains
the relay's limits).

## Requirements

- Linux, **x86-64** (any CPU, no AVX needed) or **arm64**, with Docker Engine and the Compose plugin
  (`docker compose version` should work). Windows/macOS with Docker Desktop work too, for trying it out.
- About 1.5 GB of disk for the images, plus the database (small).
- For public access: a domain (two names: the site and the relay) pointing at the machine, and ports 80 + 443.

## Quick start

```sh
git clone https://github.com/thesupersupersigma/thesupersuperanime.lol.git && cd thesupersuperanime.lol
cp .env.example .env
# fill in the four REQUIRED values in .env, each with its own: openssl rand -hex 32
docker compose up -d        # first run builds the site image (a few minutes) and pulls RECONSUMET.TS
```

Open <http://localhost:3000>. `docker compose ps` should show every service `healthy` after a minute;
<http://localhost:3000/api/health> reports the site, database and RECONSUMΣT.TS. On its first start RECONSUMΣT.TS
imports its anime catalog (about 30 seconds), so search can be empty for a moment.

Instead of building the site you can pull the prebuilt multi-arch image
(`ghcr.io/thesupersupersigma/thesupersuperanime`, tags = versions and `latest`): `docker compose pull site`.
`SITE_VERSION` and `RECONSUMET_VERSION` in `.env` pin the versions.

By default the site (port 3000) and the relay (port 8081) listen on `127.0.0.1` only. `BIND_ADDR=0.0.0.0` makes them
reachable from your network; `SITE_PORT` / `RELAY_PORT` change the ports if they're taken. The API and Postgres are
never published: only the site talks to them, inside the compose network.

**No sign-in method is on yet**, so the site works for guests only. Turn on the ones you want: [auth.md](auth.md).

## Going public: HTTPS in front

Viewers need two HTTPS addresses: the **site** and the **relay** (their browser fetches video from the relay
directly). In `.env`:

```sh
SITE_URL=https://anime.example.com
RELAY_PUBLIC_URL=https://relay.example.com
TRUSTED_PROXIES=172.16.0.0/12      # your proxy's address as the containers see it (see below)
```

`SITE_URL` must be exact: it's where emails link to, the origin passkeys are bound to, and the only site origin the
relay accepts. The site never trusts the request's `Host` header for any of that.

### Option A: the bundled Caddy (you have no reverse proxy yet)

Point both names at the machine (DNS `A`/`AAAA` records), open ports 80 and 443, and add to `.env`:

```sh
SITE_DOMAIN=anime.example.com
RELAY_DOMAIN=relay.example.com
COMPOSE_PROFILES=caddy
```

`docker compose up -d`. Caddy fetches and renews Let's Encrypt certificates by itself (it needs port 80 for that) and
reaches the site and relay over the compose network, so `TRUSTED_PROXIES=172.16.0.0/12` (Docker's private range;
`docker network inspect anime_default` shows the exact subnet) is right, and the default `BIND_ADDR=127.0.0.1` keeps
the raw ports off the internet.

### Option B: a reverse proxy you already run (nginx, Traefik, …)

Proxy `anime.example.com` → `127.0.0.1:3000` and `relay.example.com` → `127.0.0.1:8081` (proxy on the same machine;
otherwise `BIND_ADDR=0.0.0.0` and a firewall). Set `TRUSTED_PROXIES` to the proxy's address as the containers see it:
for a proxy on the host that's the Docker bridge gateway (usually `172.17.0.1` or the compose network's `.1`; when in
doubt `172.16.0.0/12`). If the proxy passes the client IP in another header, set `CLIENT_IP_HEADER` (for example
`X-Real-IP` for nginx, `CF-Connecting-IP` behind a Cloudflare Tunnel). nginx needs nothing special for the relay
except no buffering limits on large responses (`proxy_buffering off;` is a good idea for video).

Without `TRUSTED_PROXIES`, everyone appears to come from the proxy's IP: sign-in rate limits then apply to all
visitors together, and sessions show the proxy's address.

### Option C: the relay on another machine

The relay is stateless: run RECONSUMΣT.TS's relay image anywhere (a VPS with more upload, for example) with the same
`RELAY_SECRET`, `RELAY_ALLOWED_ORIGINS=<SITE_URL>`, then set `RELAY_PUBLIC_URL` to its address here and stop the local
one (`docker compose up -d --scale relay=0`). The site's Content-Security-Policy allows media only from
`RELAY_PUBLIC_URL`.

## Email (SMTP)

Any SMTP server works (your mail provider, a transactional service, your own Postfix):

```sh
SMTP_HOST=smtp.example.com
SMTP_PORT=587               # 465 = TLS from the start (SMTP_SECURE then defaults to true)
SMTP_USER=…
SMTP_PASS=…
SMTP_FROM=Anime <noreply@example.com>
```

With SMTP, email sign-up confirms addresses, forgotten passwords can be reset, and 2FA can send codes by email.
Emails are plain text, signed with `SITE_NAME`. To try it without a real server:
`docker compose --profile mail up -d` starts Mailpit, a fake inbox at <http://localhost:8025>; set
`SMTP_HOST=mailpit`, `SMTP_PORT=1025` and any `SMTP_FROM`.

## Every setting

All in `.env`; [`.env.example`](../.env.example) has each one with its default and an example. Empty = default.

| Variable | Default | What |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | **required** | password of the bundled Postgres (hex; base64 can contain `/`, which breaks the URLs) |
| `BETTER_AUTH_SECRET` | **required** | signs sessions, encrypts 2FA secrets; ≥ 32 characters; changing it signs everyone out |
| `RECONSUMET_API_KEY` | **required** | the site's key for the API; compose creates it in the API (`API_BOOTSTRAP_KEY`); ≥ 32 characters |
| `RELAY_SECRET` | **required** | seals stream links between API and relay; ≥ 32 characters |
| `SITE_URL` | `http://localhost:3000` | public address of the site |
| `SITE_NAME` | `Anime` | header, titles, emails, authenticator apps |
| `SITE_DESCRIPTION` | none | home page + search engines |
| `SITE_LOGO_URL` | none | logo instead of the name |
| `DISCORD_INVITE_URL` | none | footer link (hidden when unset) |
| `ANALYTICS_SCRIPT_URL` | none | one analytics script (allowed in the CSP automatically) |
| `HOME_ANILIST_IDS` | `16498,1535,5114,113415,21,154587` | AniList IDs on the placeholder home |
| `IMAGE_HOSTS` | `s4.anilist.co,cdn.myanimelist.net,img1.ak.crunchyroll.com` | hosts posters and episode thumbnails may be resized from (others fall back to the cover) |
| `SHOW_ADULT` | `false` | show adult (18+) titles in search and adult tags on anime pages |
| `RELAY_PUBLIC_URL` | `http://localhost:8081` | where browsers reach the relay |
| `RECONSUMET_API_URL` | `http://localhost:8080` (compose: `http://api:8080`) | the API, as the site's server sees it |
| `RECONSUMET_VERSION` | `0.6.0` | API + relay image tag |
| `SITE_VERSION` | `0.5.0` | site image tag |
| `TRUSTED_PROXIES` | none | proxies whose `CLIENT_IP_HEADER` is believed (comma list, CIDR ok) |
| `CLIENT_IP_HEADER` | `X-Forwarded-For` | header with the viewer's IP |
| `BIND_ADDR` | `127.0.0.1` | where site/relay/Mailpit ports are published |
| `SITE_PORT`, `RELAY_PORT`, `MAILPIT_PORT` | `3000`, `8081`, `8025` | host ports |
| `SITE_DOMAIN`, `RELAY_DOMAIN` | none | caddy profile only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | none, `587`, by port | email |
| `AUTH_EMAIL_ALLOW_UNVERIFIED` | `false` | email sign-up without SMTP |
| `AUTH_BREACHED_PASSWORD_CHECK` | `true` | refuse breached passwords |
| `AUTH_NEW_SIGNIN_EMAIL` | `false` | email on every new sign-in (needs SMTP) |
| `DISCORD_…`, `GOOGLE_…`, `GITHUB_…`, `MICROSOFT_…` `_CLIENT_ID` / `_CLIENT_SECRET` | none | logins, see [auth.md](auth.md) |
| `MICROSOFT_TENANT_ID` | `common` | which Microsoft accounts may sign in |
| `DATABASE_URL` | compose sets it | only when running without Docker |

More RECONSUMΣT.TS settings (rate limits, AniList cap, relay bandwidth limits…) go in an optional `reconsumet.env`
next to `compose.yaml`; compose passes it to the API and relay. See RECONSUMΣT.TS's own docs for the list.

The site validates its settings at startup and stops with one message listing every missing or invalid value.

## Upgrades

```sh
git pull                       # new compose.yaml / docs
docker compose pull            # new RECONSUMET.TS images (and the site's, if you use the prebuilt one)
docker compose up -d --build   # rebuilds the site if you build it yourself
```

Database migrations run automatically when the site starts, and RECONSUMΣT.TS migrates its own database the same way.
Read the release notes before jumping several versions. The image applies the site's migrations with a small runner
(`server/migrate.mjs`) instead of the Prisma CLI, which keeps the image about half the size. It writes the same
`_prisma_migrations` table Prisma does, so `pnpm db:migrate` (`prisma migrate deploy`) from a checkout works against
the same database too, and each sees the other's migrations as applied.

## Backups

Both databases live in the `pgdata` volume. Dump them while running:

```sh
docker compose exec -T postgres pg_dump -U anime -Fc site > site-$(date +%F).dump
docker compose exec -T postgres pg_dump -U anime -Fc reconsumet > reconsumet-$(date +%F).dump
```

The `site` database holds accounts and everything people saved; back it up regularly. `reconsumet` can be rebuilt
from scratch (it re-imports the catalog), but a dump keeps your manual mapping fixes. Restore into a fresh stack with
`docker compose exec -T postgres pg_restore -U anime -d site --clean < site-….dump`. Keep `.env` safe too: without
the same `BETTER_AUTH_SECRET`, saved 2FA secrets can't be decrypted.

## Running without Docker (development)

Windows, macOS or Linux with Node 26 and pnpm 11, a Postgres 15+ you can reach, and a RECONSUMΣT.TS API running
anywhere (its own `docker compose up -d`, or `pnpm dev` in its repo):

```sh
pnpm install
cp .env.example .env    # set DATABASE_URL, BETTER_AUTH_SECRET, RECONSUMET_API_URL, RECONSUMET_API_KEY
pnpm db:migrate         # apply migrations
pnpm dev                # http://localhost:3000
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; end-to-end tests: [e2e/README.md](../e2e/README.md).
`pnpm dev` runs without the client-IP preload the Docker image uses, so every visitor counts as one local IP there.
