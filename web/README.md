# thesupersuperanime.lol — Developer Guide

Full setup, architecture, and environment variable reference for the Next.js app in `web/`.

---

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database
- A [Vercel](https://vercel.com) account (for deployment) or just run locally
- A Discord app (for OAuth + bot features)

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/thesupersupersigma/thesupersuperanime.lol.git
cd thesupersuperanime.lol/web

# 2. Install dependencies
npm install

# 3. Copy the env template and fill in your values
cp .env.example .env.local

# 4. Push the Prisma schema to your database
npx prisma db push

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Minimum required env vars to get the site running locally:**
- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
- `TOKEN_SECRET` and `ENCRYPTION_SECRET` (any random 32+ char strings)
- `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` (for Discord login)

Everything else is optional for local dev.

---

## Available Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
npx prisma db push # Push schema changes to DB (never use migrate dev)
npx prisma studio  # Browse DB in browser
```

> **Note:** Always use `prisma db push`, never `prisma migrate dev`. The project uses the push workflow.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values below.

### Core

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string (`postgresql://...`) |
| `NEXT_PUBLIC_SITE_URL` | Full site URL including protocol, no trailing slash (e.g. `https://www.thesupersuperanime.lol`). Used for CORS, OAuth redirects, email links, and OG metadata. |

### Auth & Security

| Variable | Description |
|---|---|
| `TOKEN_SECRET` | Secret for HMAC-SHA256 signing of HLS proxy tokens. Any random 32+ char string. |
| `ENCRYPTION_SECRET` | Key for AES-256-CBC encryption of stream URLs in proxy tokens. Any random 32+ char string. |
| `CRON_SECRET` | Bearer token required for all `/api/cron/*` routes. Set the same value in GitHub Actions secrets. |
| `ANILIST_SYNC_SECRET` | Separate secret for the AniList auto-sync cron (`x-cron-secret` header). Set in GitHub Actions secrets. |
| `GITHUB_WEBHOOK_SECRET` | Verifies `X-Hub-Signature-256` on GitHub push webhook events. Set in both GitHub repo settings and here. |
| `VERCEL_BYPASS_SECRET` | Vercel deployment protection bypass token. Used in Discord OAuth callback redirect. |

### Site Access Gates

| Variable | Description |
|---|---|
| `SITE_PASSWORD` | Password for the site-wide password lock (shows a login page before anything else). |
| `SITE_PASSWORD_GATE` | Set to `off` to disable the site password gate. Default: on. |
| `DISCORD_GATE` | Set to `off` to disable the Discord/email verification gate. Default: on. |
| `MASTER_GATE` | Set to `off` to allow anonymous browsing when `DISCORD_GATE=on`. Default: on. |

### Admin

| Variable | Description |
|---|---|
| `ADMIN_1`, `ADMIN_2`, ... | Discord user IDs that have admin access. Sequential — stop at the first missing index. These are the **only** admin authorization mechanism. |
| `OWNER_DISCORD_ID` | Discord user ID of the site owner. Gets the Owner badge (supersedes Admin badge). |
| `ADMIN_PASSWORD` | Unused — kept for legacy compatibility. Leave blank. |

### Discord

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | Discord OAuth2 app client ID. |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 app client secret. |
| `DISCORD_BOT_TOKEN` | Bot token for DMs (badge notifications, signup alerts, watch party commands). |
| `DISCORD_GUILD_ID` | Your Discord server ID. Used for auto-adding users to the server on login. |
| `DISCORD_PUBLIC_KEY` | App public key from Discord Developer Portal → General Information. Required for slash command signature verification. |
| `DISCORD_APP_ID` | Application ID from Discord Developer Portal. Required for registering slash commands. |
| `DISCORD_ALERT_USER_ID` | Discord user ID to receive new signup DM alerts. |

### Discord Webhooks

| Variable | Description |
|---|---|
| `DISCORD_WEBHOOK_URL` | Webhook for provider health failure/recovery alerts. |
| `DISCORD_ALERT_WEBHOOK_URL` | Webhook for security/admin alerts (Discord auth callbacks). |
| `DISCORD_NEW_EPISODES_WEBHOOK_URL` | Webhook for `#new-episodes` channel — posts when a new episode airs for watchlisted anime. |
| `DISCORD_BADGES_WEBHOOK_URL` | Webhook for `#badges` channel — posts when a user earns a notable milestone badge. |
| `DISCORD_UPDATES_WEBHOOK_URL` | Webhook for `#updates` channel — posts when a changelog entry is published. |

### Video & Streaming

| Variable | Description |
|---|---|
| `ANIVEXA_API_URL` | Base URL of the self-hosted Anivexa API on Oracle VM (e.g. `http://64.181.222.197:4000`). |
| `PROXY_VM_URL` | HTTPS URL of the tsss-proxy on Oracle VM (e.g. `https://nginx.thesupersuperanime.lol:8443`). Segments are proxied through this to avoid Vercel bandwidth. |

### Email

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | API key for [Resend](https://resend.com). Used for email verification, password reset, and nudge emails. |

### AniList OAuth

| Variable | Description |
|---|---|
| `ANILIST_CLIENT_ID` | AniList OAuth app client ID (for server-side sync). |
| `ANILIST_CLIENT_SECRET` | AniList OAuth app client secret. |
| `NEXT_PUBLIC_ANILIST_CLIENT_ID` | Same as `ANILIST_CLIENT_ID` but exposed to the browser for the OAuth connect flow. |

### GitHub Integration

| Variable | Description |
|---|---|
| `GITHUB_PAT` | Personal access token for syncing issues to a GitHub repo. Needs `repo` scope. |
| `GITHUB_ISSUES_REPO` | Target repo for issue sync in `owner/repo` format (e.g. `thesupersupersigma/issues-thesupersuperanime.lol`). |

### Feature Flags

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_ADS_ENABLED` | Set to `true` to enable HilltopAds scripts in the layout. Default: `false`. |

### Legacy / Unused

| Variable | Description |
|---|---|
| `SCRAPER_SERVICE_URL` / `SERVICE_SECRET` | Legacy scraper service. Only used by the admin health-check dashboard's provider registry. Not part of the live video pipeline. |
| `MIRURO_API_URL` / `MIRURO_API_URL_2` / `MIRURO_API_URL_3` / `MIRURO_API_KEY` | Legacy Miruro scraper. No longer used in the video pipeline. |
| `BETTERSCRAPER_URL` / `BETTERSCRAPER_API_KEY` | Legacy GogoScraper integration. Parked on a feature branch, not merged. |

---

## Architecture Overview

See [`CLAUDE.md`](./CLAUDE.md) for the full technical deep-dive including:
- Request lifecycle & auth layers (`src/proxy.ts`)
- Video source pipeline (Anivexa → encrypted proxy tokens → hls.js)
- Player patterns and gotchas (resume, stall recovery, AniSkip)
- Badge engine, nudge emails, watch parties, sitewide chat
- All data fetching patterns

---

## Database

Schema is in `prisma/schema.prisma`. Key models:

`User`, `WatchHistory`, `Watchlist`, `Comment`, `CommentLike`, `SourceToken`, `ProviderStatus`, `ProviderLog`, `Issue`, `GenreVote`, `Announcement`, `WatchStreak`, `Follow`, `WatchParty`, `Badge`, `UserBadge`, `GenreCache`, `AiringWatch`, `Season`, `SeasonResult`, `ChatMessage`, `ChatTimeout`, `ChatChannel`, `Changelog`, `StatusIncident`, `StatusCheck`

Always use `npx prisma db push` to apply schema changes. Never use `migrate dev`.

---

## GitHub Actions

Workflows in `.github/workflows/`:

| Workflow | Schedule | What it does |
|---|---|---|
| `anilist-sync.yml` | Every 6 hours | Syncs AniList watch progress for all linked users |
| `streak-emails.yml` | Daily at 18:00 UTC | Sends streak-at-risk, leaderboard, new episode, and completion nudge emails |
| `health-check.yml` | Every 5 minutes | Pings all stream providers and infrastructure services, updates status page |
| `cleanup.yml` | Daily | Cleans up expired `SourceToken` rows |

All cron workflows run on the self-hosted GitHub Actions runner on the Oracle VM. They authenticate with `CRON_SECRET`.

---

## Discord Slash Commands

Register commands once after setting `DISCORD_BOT_TOKEN` and `DISCORD_APP_ID` in `.env.local`:

```bash
node scripts/register-discord-commands.mjs
```

Then set the **Interactions Endpoint URL** in your Discord app's General Information page to:
```
https://www.thesupersuperanime.lol/api/discord/interactions
```

Available commands:
- `/watchparty anime:<name>` — 3-step flow: search → select → episode → creates room (ephemeral)
- `/watchparty-join code:<code|link>` — join a watch party by room code or link (ephemeral)

---

## Deployment

The app deploys to Vercel automatically on push to `master`. All env vars must be set in the Vercel project dashboard.

The Oracle Cloud VM (`64.181.222.197`) runs:
- **Anivexa API** — port 4000, PM2-managed (`pm2 start`)
- **tsss-proxy** — port 8000, PM2-managed, served over HTTPS via nginx at `nginx.thesupersuperanime.lol:8443`
- **Self-hosted GitHub Actions runner** — for cron jobs
- **Discord leaderboard bot** — standalone Node.js script via crontab, posts top 10 to `#leaderboard` every 12h
