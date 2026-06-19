# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev

# Production build (Prisma client + Next.js build; core-dist is pre-committed, not rebuilt)
npm run build

# Linting
npm run lint

# Database schema push (run from /web)
npx prisma generate
npx prisma db push
```

No test suite is configured. TypeScript build errors are ignored (`ignoreBuildErrors: true` in next.config.ts) — rely on your editor's type checking instead.

`npm run dev` is plain `next dev` — there is no `predev`/`prebuild` core rebuild step anymore. The `../core` scraper package no longer exists in this repo; `src/lib/core-dist/` is a standalone, pre-built copy of `@tsss/core` committed directly to the repo. Do not edit it directly, and don't expect a sibling `core/` directory to exist.

## Architecture Overview

This is a **Next.js 16 App Router** anime streaming site backed by PostgreSQL (Neon) via Prisma.

- **`src/lib/core-dist/`** — pre-built `@tsss/core` module (referenced via `src/lib/core.ts`). Today it's only used for `checkRateLimit` (rate limiting `/api/source`) and the legacy provider registry (`kiwi`/`ally`/`arc`/`zoro`/`jet`/`bee`) used by the admin health-check dashboard. `getRacedSources` is still exported but is **dead code** — it is no longer part of the video source pipeline (see below).
- **Video sources** now come from an external **Anivexa** API (`ANIVEXA_API_URL`), not from the bundled scraper providers.

## Request Lifecycle & Auth Layers

All authentication is enforced in **`src/proxy.ts`** before any route handler runs. (Next.js 16 renamed the `middleware` file convention to `proxy` — `src/proxy.ts` *is* the middleware and holds the matcher `config`; don't rename it back to `middleware.ts`. `.next/.../middleware-manifest.json` can read empty even though the proxy is active — verify with `curl -sI`, not the manifest.)

Checks run in this order:

1. **Static/internal passthrough** — `/_next`, `/favicon`, `/.well-known`, `robots.txt`, `sitemap.xml`, `llms.txt`, image extensions skip all checks.
2. **Always public, no auth at all** — `/api/proxy/*`, `/api/subtitle-proxy/*`, `/api/auth/discord/*`, `/api/auth/me`, `/login`, `/api/announcement*` (includes `/api/announcement/stream`).
3. **Cron routes** (`/api/cron/*`) — require `Authorization: Bearer <CRON_SECRET>`. `/api/cron/streak-emails` additionally re-checks the same header in-route against `CRON_SECRET` (see Nudge Emails below) — redundant with the gate above but harmless.
4. **Site password gate** — `site-auth` cookie vs `SITE_PASSWORD`. Disable with `SITE_PASSWORD_GATE=off`. API routes get a 401 JSON response; pages redirect to `/login`.
5. **Discord/email verification gate** — gates most remaining routes, **including `/admin/*` and `/api/admin/*`** (they are not in the exempt list). Disable entirely with `DISCORD_GATE=off`. `MASTER_GATE=off` lets anonymous (no `user-session` cookie) users browse without a session, but logged-in users still need `discord-linked=1` or `email-verified=1` cookies (mirrored from the DB into cookies since the proxy runs on the Edge and can't query Postgres). Exempt paths: `/account*`, `/api/auth/*`, `/api/import/*`, `/api/watchlist/*`, `/api/progress/*`, `/leaderboard`, `/user/*`.

There is **no separate proxy-level admin gate** — `/admin/*` and `/api/admin/*` only pass through the site password and Discord/email gates above. Admin authorization is enforced entirely server-side via `isAdmin(discordId)`: `src/app/admin/page.tsx` calls `getCurrentUser()` + `isAdmin()` and `redirect("/")`s non-admins, and every `/api/admin/*` route handler does the same check and returns 401/403. There is no `/admin/login` page. `ADMIN_PASSWORD` / `admin-auth` cookie are unused.

Auth helpers live in `src/lib/auth.ts` (scrypt + HMAC password hashing, no bcrypt). `isAdmin(discordId)` checks the Discord ID against the `ADMIN_1`, `ADMIN_2`, ... env var allowlist (sequential, stops at the first missing index) — this is the **sole** admin authorization mechanism.

## Video Source Pipeline (Anivexa)

`POST /api/source` (`src/app/api/source/route.ts`) is the core endpoint:

1. Rate-limited via `checkRateLimit()` from `@/lib/core` (10 req/60s per session).
2. Calls the **Anivexa** API at `ANIVEXA_API_URL`:
   - `GET {ANIVEXA_API_URL}/episodes/{animeId}` → returns per-provider episode ID lists for `anikoto` and `anineko`, each with `sub`/`dub` episode arrays.
   - For each `(provider, audioType)` pair, finds the episode by `number` and fetches `GET {ANIVEXA_API_URL}/{episodeId}`.
   - Normalizes the response (`anikoto` nests under `ssub`/`sdub`, `anineko` returns `streams`/`subtitles` directly) and keeps only `type === "hls"` streams.
3. `PROVIDER_PRIORITY` (`anikoto: 0, anineko: 1`) picks a single best provider **per audio type** (sub/dub) — streams from other providers of the same type are dropped.
4. Subtitles are **deduped by language** (`dedupedSubtitles`) since a provider can return multiple tracks for the same language.
5. Each stream URL + cookies + referer is JSON-encoded, encrypted with AES-256-CBC (`ENCRYPTION_SECRET`), and the resulting token is HMAC-SHA256 signed (`TOKEN_SECRET`). `SourceToken` rows are stored in the DB with a **3-hour expiry** (covers a full viewing session including pauses).
6. Response shape: `{ servers: [{ name, type, sources, subtitles }], mirrorUsed, fallbackReason }`.

`GET /api/proxy/[token]` (`src/app/api/proxy/[token]/route.ts`) decrypts and proxies the stream:
- Validates token, expiry, IP, and session before serving.
- For `.m3u8` playlists, rewrites every segment/key URI to a new `/api/proxy/<token>.ts|.key` — each rewritten segment **inherits the parent playlist's `expiresAt`** so segments never expire mid-episode while the playlist token is still valid.
- For segments/keys, proxies the upstream fetch with spoofed `User-Agent`/`Referer`/`Origin` (kwik/owocdn-style hosts get `https://kwik.cx/` as referer; otherwise `https://megaplay.buzz/` unless the source supplied its own referer), forwarding `Range`/`Content-Range`/`Content-Length`/`Accept-Ranges` so the browser can seek.
- Aborted requests (user skips ahead) return `499` instead of erroring.

## Player Patterns & Gotchas (`src/components/player/anime-player.tsx`)

This is a Vidstack (`@vidstack/react`) player wrapping hls.js. Several non-obvious things keep playback resume/switching from breaking — read the inline comments before touching this file.

- **Resume via `startPosition`, not seek.** hls.js engines are positioned by setting `provider.config.startPosition` in `onProviderChange` (fires *before* the hls.js instance is constructed), so the first manifest fetch buffers at the resume offset directly — no play-from-0-then-seek, no buffer flush/stall. Native HLS (Safari/iOS) and MP4 reset `currentTime` to 0 on load and are instead seeked in `onCanPlay`.
- **Do not set `preferNativeHLS` on `<MediaPlayer>`.** It was tried and removed (commit `026bca3`) — it caused the original freeze-on-resume bug. If hls.js playback issues resurface, this is the first thing to check hasn't crept back in.
- **Server/audio/quality switches reuse the live hls.js instance.** Vidstack only fires `onProviderChange` on a provider *type* change, not a same-type src swap. A switch stashes `player.currentTime` into `startPositionRef`, and the `srcUrl`-change effect sets `provider.instance.config.startPosition` directly on the persistent instance.
- **Stall recovery has three layers**: `onProviderChange` sets `maxBufferHole`/`nudgeMaxRetry`; `onWaiting` re-kicks `provider.instance.startLoad()` (no position arg — passing one jumps to the end) after a 6s watchdog, but does nothing near the end or while paused (to avoid a false `ended`); `onPlaybackError` is fatal (dead/expired proxy token) and calls `onSourceFailure` to re-fetch sources from the parent.
- **AniSkip** intro/outro skip button: `https://api.aniskip.com/v2/skip-times/{malId}/{episodeNum}?types[]=op&types[]=ed&episodeLength=...` is fetched once duration is known (keyed by `${malId}-${episodeNum}` to avoid refetching). Requires `anime.idMal` from AniList — silently no-ops if missing or the API errors.
- **14s server-timeout overlay** arms whenever `selectedServerName` changes; cleared by `onCanPlay`/`onPlaying`.

## Subtitle Proxy

`GET /api/subtitle-proxy?url=...` (`src/app/api/subtitle-proxy/route.ts`) — public (exempted in `src/proxy.ts`), fetches `.vtt` subtitle files from an **allowlist of hosts** (`mewstream.buzz`, `megaplay.buzz`, `vidwish.live`, `anineko.to`, `anikototv.to`, `cdn.mewstream.buzz`, `s.megaplay.buzz`, `lostproject.club`, `watching.onl`, plus subdomains) with a spoofed `User-Agent`/`Referer`/`Origin` (`megaplay.buzz`). Returns `text/vtt` with CORS allowing `NEXT_PUBLIC_SITE_URL`. The player references subtitle tracks via this proxy (`<Track src="/api/subtitle-proxy?url=...">`), not the raw provider URL — adding a new subtitle CDN requires adding its host here. This feature is still actively being worked on.

## Nudge Emails

`GET /api/cron/streak-emails` (`src/app/api/cron/streak-emails/route.ts`) runs four independent nudge passes in one request, each gated per-user by a `User.emailNotif*` boolean (`emailNotifStreak`, `emailNotifRanked`, `emailNotifNewEpisode`, `emailNotifCompletion`, all default `true`, toggled via `PATCH /api/account/notifications`):

- **Streak at risk** — `WatchStreak.currentStreak >= 2` and `lastWatchDate` is yesterday (UTC date match) → `sendStreakAtRiskEmail`.
- **Leaderboard rank change** — recomputes the all-time leaderboard ranking (no date filter, no `take`), compares each user's new rank to `User.lastKnownLeaderboardRank`; a rank that got worse (`newRank > oldRank`) triggers `sendLeaderboardPassedEmail` naming whoever now occupies the user's old rank position. `lastKnownLeaderboardRank` is then updated for every ranked user regardless of whether an email fired.
- **New episode dropped** — for each `Watchlist` row with `status: "Watching"`, fetches `getAnimeById` (cached per anime within the request) and compares `nextAiringEpisode.episode - 1` against `Watchlist.lastNotifiedEpisode` → `sendNewEpisodeEmail`, then advances `lastNotifiedEpisode`.
- **Completion nudge** — for each `(user, animeId)` with `Watchlist.status: "Watching"` and `completionNudgeSent: false`, if `anime.episodes - episodesWatched` is between 1 and 3 → `sendCompletionNudgeEmail` and sets `completionNudgeSent: true` (one-time per anime per user, never re-sent).

All four email sends are fire-and-forget (`void ... .catch(...)`) so one Resend failure can't abort the rest of the batch. Auth: `CRON_SECRET`, same as every other `/api/cron/*` route.

## Key Directories

| Path | Purpose |
|------|---------|
| `src/app/(site)/` | Public-facing pages (home, search, watch, anime detail, genres, issues) |
| `src/app/(auth)/` | Auth pages (login, account, Discord linking, password reset) |
| `src/app/admin/` | Admin dashboard (provider health, logs, issues, announcements) |
| `src/app/api/` | All API route handlers |
| `src/components/` | Shared React components (player, nav, comments, episode list/sidebar, cards, announcement banner) |
| `src/providers/` | Thin adapter wrapping `core-dist`'s legacy providers for the admin health-check dashboard only |
| `src/lib/core-dist/` | Pre-built `@tsss/core` — rate limiting + legacy provider health checks. Do not edit directly |
| `prisma/schema.prisma` | DB schema (User, WatchHistory, Watchlist, Comment, CommentLike, SourceToken, ProviderStatus, ProviderLog, Issue, GenreVote, Announcement, WatchStreak) |

## Data Fetching Patterns

- **Anime metadata**: AniList GraphQL via `src/lib/anilist.ts` (`searchAnime`, `getTrending`, `getSeasonal`, `getAnimeById`, `getAnimeByGenre`, `getDisplayTitle`, `getMainStudio`, `getEpisodeSchedule`)
- **Watch progress**: Dual-tracked — per authenticated user (`userId`) or per anonymous session (`sessionId`); stored as milliseconds in `WatchHistory`. `/api/progress` dedupes to one row per anime (latest episode) when returning history.
- **Episode lists**: `EpisodeList` (anime detail page) is a pure number-range picker — 50 episodes per page with a range `<select>`, computed from `nextAiringEpisode - 1` (if airing) or `anime.episodes`; it doesn't fetch per-episode metadata. `EpisodeSidebar` (watch page) uses the same 50-per-page range picker but renders each episode as a Miruro-style row (thumbnail, title, air date) — it client-fetches `GET /api/episodes/{animeId}` (wraps `getEpisodeSchedule`) on mount for AniList `airingSchedule` (episode → airingAt) and `streamingEpisodes` (title/thumbnail per episode, frequently empty), falling back to the anime's `coverImage.medium` for missing thumbnails.
- **Comments**: Nested (parent + replies), soft-deleted (`deletedAt`), with `CommentLike` join table
- **Announcements**: `Announcement` model (single active row at a time). `GET /api/announcement` is a one-shot public fetch; `GET /api/announcement/stream` is a public SSE endpoint (sends the active announcement on connect, then polls the DB every 10s and pushes changes, with a 25s keepalive ping). `POST /api/admin/announcement` (admin-only, `{ action: "publish" | "clear", message?, type? }`) deactivates any prior active row before creating a new one. `AnnouncementBanner` subscribes via `EventSource`, is dismissible per-announcement via `sessionStorage`, and hides itself while the page is in fullscreen (`fullscreenchange`).

## Environment Variables

- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXT_PUBLIC_SITE_URL` — used for CORS headers (proxy/subtitle-proxy), Discord OAuth redirect, email links, OpenGraph metadata
- `SITE_PASSWORD` / `SITE_PASSWORD_GATE` — site-wide password lock (`SITE_PASSWORD_GATE=off` disables it)
- `ADMIN_1`, `ADMIN_2`, ... — Discord ID allowlist for `isAdmin()`, the sole admin authorization check (`/admin` page + every `/api/admin/*` route)
- `DISCORD_GATE` / `MASTER_GATE` — control the Discord/email verification gate (see Auth Layers above)
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` — Discord OAuth linking
- `VERCEL_BYPASS_SECRET` — Vercel deployment protection bypass (used in the Discord OAuth callback redirect)
- `DISCORD_WEBHOOK_URL` — provider health failure/recovery alerts
- `DISCORD_ALERT_WEBHOOK_URL` / `DISCORD_ALERT_USER_ID` — admin login / security alerts (Discord callback route)
- `TOKEN_SECRET` / `ENCRYPTION_SECRET` — video source token signing (HMAC-SHA256) & URL encryption (AES-256-CBC)
- `ANIVEXA_API_URL` — base URL for the Anivexa video source API (see Video Source Pipeline)
- `CRON_SECRET` — Bearer token for `/api/cron/*` (cleanup, health-check, streak-emails)
- `ANILIST_SYNC_SECRET` — `x-cron-secret` token for `/api/anilist/sync/auto` only
- `RESEND_API_KEY` — transactional email (verification, password reset, streak/leaderboard/episode/completion nudges — see Nudge Emails)
- `GITHUB_PAT` / `GITHUB_ISSUES_REPO` — syncs the `Issue` table with a GitHub repo's issues (`/api/admin/issues/sync`)
- `SCRAPER_SERVICE_URL` / `SERVICE_SECRET`, `MIRURO_API_URL*` / `MIRURO_API_KEY`, `BETTERSCRAPER_URL` / `BETTERSCRAPER_API_KEY` — consumed by the legacy providers bundled in `core-dist`, only relevant to the admin provider-health dashboard, not the live video pipeline

## Styling

Tailwind CSS v4 (PostCSS). Custom fonts: **DM Sans** (body) and **Syne** (headings), loaded via `next/font/google` in the root layout. Use `className` with Tailwind utilities; no CSS modules. Admin/player UI components mostly use inline `style={{}}` objects rather than Tailwind classes — match the surrounding file's convention rather than mixing both in one component.

## Git Workflow

Feature work happens on topic branches (e.g. `skip-intro/outro`, `robots`, `ads`, `gogoscraper`) merged into `master` via PR. Commit directly to `master` is also common for small/local changes. There is no CI test gate — `npm run lint` and manual testing via `npm run dev` are the main checks before merging.
