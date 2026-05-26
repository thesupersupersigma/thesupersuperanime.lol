# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (also builds ../core and copies dist)
npm run dev

# Production build (generates Prisma client + Next.js build)
npm run build

# Linting
npm run lint

# Database schema push (run from /web)
npx prisma generate
npx prisma db push
```

No test suite is configured. TypeScript build errors are ignored (`ignoreBuildErrors: true` in next.config.ts) — rely on your editor's type checking instead.

## Architecture Overview

This is a **Next.js 16 App Router** anime streaming site backed by PostgreSQL (Neon) via Prisma. It is part of a two-package monorepo:

- **`../core`** — Scraper logic (Playwright + stealth plugins, provider implementations). Built to `../core/dist`, then copied to `src/lib/core-dist/` by `predev`. Referenced as `@tsss/core` via tsconfig path alias.
- **`web/`** (this package) — Next.js frontend + API routes.

The core is only rebuilt during `predev`. The `prebuild` script skips the core rebuild assuming `core-dist` is already committed.

## Request Lifecycle & Auth Layers

All authentication is enforced in **`src/proxy.ts`** before any route handler runs. (Next.js 16 renamed the `middleware` file convention to `proxy` — `src/proxy.ts` *is* the middleware and holds the matcher `config`; don't rename it back to `middleware.ts`. Note: `.next/.../middleware-manifest.json` can read empty even though the proxy is active — verify with `curl -sI`, not the manifest.) The layers in order:

1. **Site password** (`site-auth` cookie vs `SITE_PASSWORD`) — gates the entire site
2. **User session** (`user-session` cookie → `db.user`) or guest session (`session-id` cookie, 1-year)
3. **Discord link gate** (`discord-linked` **or** `email-verified` cookie) — logged-in users pass with either a linked Discord account or a verified email; required for most site routes; exempt: `/account`, `/api/auth/*`
4. **Admin gate** (`admin-auth` cookie vs `ADMIN_PASSWORD`) — guards `/admin/*` and `/api/admin/*`

Auth helpers live in `src/lib/auth.ts` (scrypt + HMAC password hashing, no bcrypt).

## Video Source Pipeline

`POST /api/source` is the core endpoint:
1. Validates the rate limit via `checkRateLimit()` from `@tsss/core` (10 req/60s per session)
2. Calls `getRacedSources()` which races multiple providers (kiwi > ally > arc > zoro > jet > bee)
3. Encrypts video URLs with AES-256-CBC (`ENCRYPTION_SECRET`) and signs tokens with HMAC-SHA256 (`TOKEN_SECRET`)
4. Stores `SourceToken` records in DB (30-min expiry)
5. Client fetches video via `GET /api/proxy/[token]`, which decrypts and redirects

## Key Directories

| Path | Purpose |
|------|---------|
| `src/app/(site)/` | Public-facing pages (home, search, watch, anime detail) |
| `src/app/(auth)/` | Auth pages (login, account, Discord linking, password reset) |
| `src/app/admin/` | Admin dashboard (provider health, logs) |
| `src/app/api/` | All API route handlers |
| `src/components/` | Shared React components (player, nav, comments, cards) |
| `src/lib/` | Utilities: `auth.ts`, `db.ts`, `anilist.ts`, `discord.ts`, `health-check.ts`, `resend.ts` |
| `src/lib/core-dist/` | Compiled scraper core — do not edit directly |
| `prisma/schema.prisma` | DB schema (User, WatchHistory, Watchlist, Comment, CommentLike, SourceToken, ProviderStatus, ProviderLog) |

## Data Fetching Patterns

- **Anime metadata**: AniList GraphQL via `src/lib/anilist.ts` (`searchAnime`, `getTrending`, `getAnimeById`)
- **Watch progress**: Dual-tracked — per authenticated user (`userId`) or per anonymous session (`sessionId`); stored as milliseconds in `WatchHistory`
- **Comments**: Nested (parent + replies), soft-deleted (`deletedAt`), with `CommentLike` join table

## Environment Variables

See `.env.example`. Key variables:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `SITE_PASSWORD` / `ADMIN_PASSWORD` — Auth gate passwords
- `TOKEN_SECRET` / `ENCRYPTION_SECRET` — Video URL signing & encryption
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` — Discord OAuth
- `SCRAPER_SERVICE_URL` / `SERVICE_SECRET` — External scraper service
- `CRON_SECRET` — Bearer token for cron job endpoints
- `VERCEL_BYPASS_SECRET` — Vercel deployment protection bypass

## Styling

Tailwind CSS v4 (PostCSS). Custom fonts: **DM Sans** (body) and **Syne** (headings), loaded via `next/font/google` in the root layout. Use `className` with Tailwind utilities; no CSS modules.
