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
2. **Always public, no auth at all** — `/api/proxy/*`, `/api/subtitle-proxy/*`, `/api/auth/discord/*`, `/api/auth/me`, `/login`, `/api/announcement*` (includes `/api/announcement/stream`), `/api/watch-party/*` (shareable rooms; the create/sync handlers still enforce auth in-route), `/api/chat/*` (sitewide chat — reads are public, the POST/delete/timeout handlers enforce auth/admin in-route), `/api/changelog*`, `/api/status` (public status page data — exact match, not `/api/admin/status`), `/api/discord/interactions` (Discord posts here with its own Ed25519 signature, verified in-route).
3. **Cron routes** (`/api/cron/*`) — require `Authorization: Bearer <CRON_SECRET>`. `/api/cron/streak-emails` additionally re-checks the same header in-route against `CRON_SECRET` (see Nudge Emails below) — redundant with the gate above but harmless.
4. **Site password gate** — `site-auth` cookie vs `SITE_PASSWORD`. Disable with `SITE_PASSWORD_GATE=off`. API routes get a 401 JSON response; pages redirect to `/login`.
5. **Discord/email verification gate** — gates most remaining routes, **including `/admin/*` and `/api/admin/*`** (they are not in the exempt list). Disable entirely with `DISCORD_GATE=off`. `MASTER_GATE=off` lets anonymous (no `user-session` cookie) users browse without a session, but logged-in users still need `discord-linked=1` or `email-verified=1` cookies (mirrored from the DB into cookies since the proxy runs on the Edge and can't query Postgres). Exempt paths: `/account*`, `/api/auth/*`, `/api/import/*`, `/api/watchlist/*`, `/api/progress/*`, `/leaderboard`, `/status`, `/user/*`.

There is **no separate proxy-level admin gate** — `/admin/*` and `/api/admin/*` only pass through the site password and Discord/email gates above. Admin authorization is enforced entirely server-side via `isAdmin(discordId)`: `src/app/admin/page.tsx` calls `getCurrentUser()` + `isAdmin()` and `redirect("/")`s non-admins, and every `/api/admin/*` route handler does the same check and returns 401/403. There is no `/admin/login` page. `ADMIN_PASSWORD` / `admin-auth` cookie are unused.

Auth helpers live in `src/lib/auth.ts` (scrypt + HMAC password hashing, no bcrypt). Secret comparisons are constant-time: `safeCompare()` in `auth.ts` (Node routes reuse it, e.g. `/api/anilist/sync/auto`), and a local `timingSafeEqualString()` in `src/proxy.ts` (the proxy runs on the Edge and can't use Node `crypto`). Auth server actions (`src/app/account/actions.ts`) have a best-effort in-memory rate limiter: sign-in 5/15min per email (never reset on success), sign-up 5/hr per IP (`x-forwarded-for`), password-reset requests 3/hr per email (over-limit silently returns `{ success: true }` to avoid confirming email existence). `isAdmin(discordId)` checks the Discord ID against the `ADMIN_1`, `ADMIN_2`, ... env var allowlist (sequential, stops at the first missing index) — this is the **sole** admin authorization mechanism.

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

- **Resume via `startPosition`, not seek.** hls.js engines are positioned by setting `provider.config.startPosition` in `onProviderChange` (fires *before* the hls.js instance is constructed), so the first manifest fetch buffers at the resume offset directly — no play-from-0-then-seek, no buffer flush/stall. Native HLS (iOS, which has no MSE support so always falls back to the native `<video>` loader) and MP4 reset `currentTime` to 0 on load and are instead seeked in `onCanPlay`.
- **No `preferNativeHLS` anymore.** A previous Safari-only `preferNativeHLS={isSafari}` flag (forcing native HLS playback so fullscreen composited correctly via `webkitSetPresentationMode`) was removed — it's no longer present on `<MediaPlayer>`, and `srcType`/`isSafari` no longer exist in this file. Safari fullscreen black-screen compositing is instead handled via `fullscreenTarget="prefer-media"` on `<MediaPlayer>` (fullscreens the media container div instead of isolating the `<video>` element) plus CSS in `globals.css` (`media-player[data-fullscreen] video` / `* { backdrop-filter: none }` rules) that strips transform/backdrop-filter conflicts during fullscreen. Desktop Safari now plays HLS via hls.js (MSE) like Chrome/Firefox; only iOS Safari still uses native HLS (no MSE support there).
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

## Watch Parties

SSE-synced rooms let a host and guests watch the same episode in lockstep. Backed by the `WatchParty` model (`roomCode`, `hostId`, `animeId`, `episodeNum`, `hostTimestamp`, `isPlaying`, `audioType` (sub/dub, synced to guests), `expiresAt = now + 6h`). Helpers in `src/lib/watch-party.ts` (`generateRoomCode` — 6-char A–Z0–9; `createWatchParty` — retries on roomCode collision; `getWatchParty` — returns null when not found **or expired**).

Routes (all `force-dynamic`, all under the always-public proxy exempt list):
- `POST /api/watch-party` — create a room (requires `getCurrentUser()`, host = the user). Returns `{ roomCode, animeId, episodeNum }`.
- `GET /api/watch-party/[roomCode]` — fetch room info (public, 404 if missing/expired).
- `POST /api/watch-party/[roomCode]/sync` — host pushes `{ timestamp, isPlaying, audioType? }`; 403 unless `user.id === hostId`.
- `GET /api/watch-party/[roomCode]/stream` — public SSE (modeled on `/api/announcement/stream`): sends state on connect, polls the DB every **500ms** (matches the host push rate) and pushes when `updatedAt` changes, 25s keepalive ping, emits `{ error: "expired" }` and closes when the room is gone.

Client: `src/components/player/watch-party-sync.tsx` is rendered by `AnimePlayer` when `watchPartyCode` is set (props `watchPartyCode` / `isWatchPartyHost`). The host POSTs `playerRef.current.currentTime`/`!paused` every **500ms**, plus an **immediate extra push** whenever play/pause toggles (tracked via `wasPlayingRef`) so guests react with near-zero lag. Guests subscribe to the SSE stream and hard-seek only when drift is between **1s and 60s** (`DRIFT_MIN`/`DRIFT_MAX` — the upper guard ignores wild currentTime from a fresh join/manifest reload), additionally **throttled to one correction per second** (`CORRECTION_COOLDOWN_MS` via `lastCorrectionRef`) so a rapid scrub can't stack seeks and overshoot the host. Guests mirror play/pause (showing a transient "⏸ Paused by host" / "▶ Resumed by host" note), mirror the host's **sub/dub** (`data.audioType`) by dispatching a `watch-party-audio-sync` window event that `anime-player.tsx` listens for and routes to `handleAudioTypeChange` (audio type lives in the player, not the sync component), and detect **host-left** (an `{ error: "expired" }` message, or an SSE `onerror` *after* the first message set `connectedRef`) → swap the Hosting/Syncing dot for a grey "⚠ Host left" and stop applying updates (`hostLeftRef` guards the message handler). It also renders the top-left "🎬 Watch Party" pill (room code + Copy Link). `watch-client.tsx` reads `?party=ROOMCODE` via `useSearchParams()`, fetches the room to decide host vs guest, and renders the "🎬 Start Watch Party" button + a "Join by room code" input (both logged-in users, no active party); Start POSTs to `/api/watch-party` and copies the join link, Join navigates to `?party=ROOMCODE`.

Discord slash commands: `POST /api/discord/interactions` verifies the Ed25519 signature with `tweetnacl` against `DISCORD_PUBLIC_KEY`, answers the PING handshake, and handles **all four interaction types** — every reply is **ephemeral** (`flags: 64`, visible only to the invoking user). Two commands:
- **`/watchparty anime:<name>`** runs a 3-step interactive flow: (1) the slash command searches AniList (`https://graphql.anilist.co`, top 5) and replies with a string select menu (`custom_id: watchparty_anime_select`); (2) selecting an option (a `MESSAGE_COMPONENT` interaction) responds with a `MODAL` (type 9, `custom_id: watchparty_episode_modal_{animeId}`) asking for the episode number; (3) the `MODAL_SUBMIT` extracts the animeId from the custom_id suffix + episode from the text input, resolves the invoking Discord user (`payload.member.user.id` in a guild, `payload.user.id` in a DM) to a site account via `discordId` for the host, calls `createWatchParty`, and replies with the join link.
- **`/watchparty-join code:<code|link>`** parses a raw room code or a full `?party=` link, looks it up via `getWatchParty`, and replies with the join link (or an expired/not-found message).

Register/update both commands via `node scripts/register-discord-commands.mjs` (needs `DISCORD_BOT_TOKEN` + `DISCORD_APP_ID` in `.env.local`).

## Sitewide Chat

Real-time chat rooms backed by the `ChatMessage` (`roomId`, `userId`, `content`, `createdAt`, soft-delete `deletedAt`), `ChatTimeout` (`userId` PK, `expiresAt`, `reason`), and `ChatChannel` (`name`, `description?`, `position`) models. A `roomId` is one of `"global"` (legacy), `"anime-{animeId}"` (numeric), or `"channel-{id}"` (a `ChatChannel` cuid) — `isValidRoomId()` in `src/lib/chat.ts` rejects anything else so callers can't spray arbitrary room ids. `chat.ts` is **server-only** (it imports `db`); it also exports `CHAT_USER_SELECT` (shared user-field select) and `ensureDefaultChannels()` (returns all channels by `position`, seeding `general`/`anime-discussion`/`off-topic` the first time none exist).

Routes (all `force-dynamic`, all under the always-public proxy exempt list via `startsWith("/api/chat")`; auth/admin enforced **in-route**):
- `GET /api/chat/[roomId]` — public. Returns the newest 50 non-deleted messages in chronological order (`orderBy desc, take 50, .reverse()`).
- `POST /api/chat/[roomId]` — requires `getCurrentUser()` (401 if not). Enforces `ChatTimeout` server-side (403 `{ error, expiresAt }` if active). Validates non-empty, ≤500 chars, trimmed. Returns `{ message }` with user included.
- `GET /api/chat/[roomId]/stream` — public SSE (modeled on `/api/announcement/stream`). Sends `{ type: "messages", messages: [...] }` with the last 50 on connect, then polls every **1.5s** for `createdAt > lastSeenAt` and pushes **only the delta** (not the full list), keepalive `{ type: "ping" }` every 25s.
- `POST /api/chat/[roomId]/delete` — `isAdmin`-gated. Soft-deletes (`deletedAt = now`) by `{ messageId }` so ids stay stable. **Note: this is a POST, not a DELETE verb.**
- `POST /api/chat/timeout` — `isAdmin`-gated. Upserts a `ChatTimeout` for `{ userId, durationMinutes, reason? }`, capped at 10080 min (7 days). `DELETE /api/chat/timeout` — `isAdmin`-gated, clears a user's timeout via `deleteMany`.
- `GET /api/chat/channels` — public, calls `ensureDefaultChannels()`, returns `{ channels }` by position. `POST` (admin) creates `{ name (1–32, `/^[a-z0-9-]+$/`, unique), description? }` at `maxPosition+1`. `DELETE` (admin) by `{ channelId }` — refuses the last remaining channel and soft-deletes that channel's messages (`roomId = channel-{id}`) before removing the row.
- `GET /api/chat/online` — public presence proxy: distinct users who sent a message in the last 5 minutes (`distinct: ["userId"]`, take 50), returns `{ users }`.

`/api/auth/me` exposes `isAdmin: isAdmin(user.discordId)` so chat components get admin status in the same request they use for `userId`.

Client (`src/components/chat/`):
- **`ChatPanel.tsx`** — the reusable core UI (props `roomId`, `currentUserId?`, `isAdmin?`, `height?`, `placeholder?`, `fillHeight?`), styled to match the comment section (32px avatars, plain rows on `#0a0a0a` — no chat bubbles, Discord badge, comment-style input). `fillHeight` makes it `height: 100%` (for the channel layout) instead of the numeric `height`. On mount it GETs the backlog **and** opens the SSE stream; both deliver the backlog so `mergeMessages()` dedupes by id. Sends POST optimistically (dedupe covers the SSE echo); a 403 sets `timedOut` and disables the input. Auto-scrolls its own container (`scrollTo`, not `scrollIntoView`). Admin-only inline hover controls in the message header: **Delete** (POST `/delete`, removes locally) and **Timeout** (`prompt()` for minutes → POST `/timeout`).
- **`/chat` is a Discord-clone** (`src/app/(site)/chat/page.tsx` → server component: `redirect("/account")` for guests, server-side `isAdmin`, passes `ensureDefaultChannels()` as `initialChannels` to **`DiscordChat.tsx`**). `DiscordChat` is a full-viewport (`.chat-page-fill` breaks out of `.site-main` padding) three-column shell: left 220px channel list (admin `+` create form / per-row `×` delete), center channel header + `<ChatPanel roomId={`channel-${activeChannelId}`} fillHeight key={activeChannelId} />` (the `key` forces a remount + fresh SSE on channel switch), right 200px online list polled from `/api/chat/online` every **60s**. CSS helpers (`.chat-page-fill`, `.chat-sidebar-scroll`) live in `globals.css`. Entry point is a **nav icon → `/chat`** (`src/components/nav.tsx`, logged-in only). There is no floating button (the old `GlobalChatButton.tsx` was removed).
- **`AnimeChat.tsx`** — thin wrapper rendered in a "Chat" section at the bottom of the anime detail page (`src/app/(site)/anime/[id]/page.tsx`, after Comments), still uses `<ChatPanel roomId={`anime-${animeId}`} height={320} />` directly (no Discord layout). Resolves `isAdmin` client-side via `/api/auth/me`.

Admin management: the admin dashboard (`src/app/admin/page.tsx`) renders a `WatchPartiesPanel` (between the Badge Management link and `IssuesPanel`) listing active (non-expired) rooms — server-fetched on load, with client-side search by room code/host and per-row delete. Backed by `GET`/`DELETE /api/admin/watch-parties` (both `isAdmin`-gated): GET returns up to 50 non-expired rooms with the host (`discordUsername`/`username`/`email`, or null for Discord-anonymous rooms), DELETE removes a room by `{ id }`.

## Changelog / Updates

Backed by the `Changelog` model (`version`, `title`, `body`, `major` boolean, `publishedAt`). A `major` entry is what triggers the "What's New" modal — minor entries only show on `/updates`.

- `GET /api/changelog` — public (exempted in `src/proxy.ts` via `startsWith("/api/changelog")`), returns the 50 most recent entries by `publishedAt desc`.
- `POST /api/changelog` — `isAdmin`-gated. Creates an entry, then fires `sendChangelogPost()` (`src/lib/discord.ts`, reads `DISCORD_UPDATES_WEBHOOK_URL`) fire-and-forget — green embed for major, blue for minor, body truncated to 300 chars.
- `DELETE /api/changelog` — `isAdmin`-gated, deletes by `{ id }`.

`/updates` (`src/app/(site)/updates/page.tsx`) is a public server component listing all entries (major entries get a blue-tinted border), linked from the site footer alongside Privacy Policy / Terms of Service.

`WhatsNewModal` (`src/components/WhatsNewModal.tsx`, mounted in `src/app/layout.tsx` just before `</body>`) fetches `/api/changelog` on mount, finds the newest `major === true` entry, and shows it once per entry via `localStorage.lastSeenChangelog` (1.5s delay before showing, so it doesn't flash on load).

Admin management: `ChangelogPanel` (`src/app/admin/components/changelog-panel.tsx`, between Badge Management and `WatchPartiesPanel` on `/admin`) — create form (version/title/body/major checkbox) + entry list with delete.

`POST /api/webhooks/github` (`src/app/api/webhooks/github/route.ts`, exempted in `src/proxy.ts` — GitHub posts with no cookies) auto-creates a `Changelog` entry (always `major: false`) per commit pushed to `refs/heads/master`. Verifies `X-Hub-Signature-256` (HMAC-SHA256 over the raw body, `GITHUB_WEBHOOK_SECRET`, `timingSafeEqual`) before parsing the body — returns 401 on mismatch/missing secret, length-checks both buffers before the timing-safe compare since `timingSafeEqual` throws on mismatched lengths. `ping` events short-circuit 200 OK; non-`push` events and non-master pushes are skipped (200, not an error). `version` is the 7-char short SHA, `title` the commit message's first line, `body` is `Committed by {author}\n\n{commit url}`, `publishedAt` is the commit's own timestamp (not `now()`) — so a batch push can land several backdated entries at once.

## Status Page

Public uptime/health page backed by two models: `StatusCheck` (`service`, `success`, `latencyMs`, `checkedAt`; one row per service per run, drives uptime % + sparkline) and `StatusIncident` (`service`, `startedAt`, `resolvedAt?`, `description?`, `autoResolved`; "open" while `resolvedAt` is null).

**All three entry points call one shared function — `runStatusChecks()` in `src/lib/status.ts`** — which: (1) live-pings four infrastructure services in parallel with `AbortSignal.timeout(5000)` — `site` (`GET {SITE}/api/auth/me`, any response = up, even 401), `database` (`db.user.count()`, up only if under 3s), `anivexa` (`GET {ANIVEXA_API_URL || fallback IP}/health`, any response = up), `anilist` (POST GraphQL, up only on 2xx); (2) reflects the latest `ProviderStatus` rows (read from DB, **not** re-scraped — `healthy→operational`, `degraded→degraded`, `broken→outage`) as `providers`-group services keyed by raw `providerId`; (3) `createMany`s one `StatusCheck` per service (`success` = operational OR degraded); (4) opens an incident when a service reads `outage` with no open incident, auto-resolves (`resolvedAt`, `autoResolved=true`) when it reads `operational` with one open — degraded/unknown leave incidents untouched; (5) returns `{ services[], overallStatus, lastUpdated, incidents: { opened, resolved } }` where each service carries `status`, `latencyMs`, `uptimePercent` (last 90 checks, 1 decimal), a 90-slot `history` array (oldest→newest, `null` = no data), and an optional open `incident`. `overallStatus` = worst of all services (outage > degraded > operational).

- `GET /api/status` (`src/app/api/status/route.ts`) — public (exact-match exempt in `src/proxy.ts`), returns `runStatusChecks()` as JSON.
- `/status` (`src/app/(site)/status/page.tsx`) — public server component (`force-dynamic`, also in the proxy discord-gate exempt list), calls `runStatusChecks()` **inline** (not via HTTP self-fetch). Renders an overall banner, an "Active Incidents" section, "Infrastructure" + "Stream Providers" group cards (each row: name, status pill, latency, uptime %, and a pure-CSS 90-bar sparkline — green/red/grey `<div>`s, no JS/canvas), and a CSS-bar "Response Times" chart. Includes a heads-up note that the page will change once scrapers are swapped (reconsumet API incoming). `RefreshButton` (`refresh-button.tsx`, `"use client"`) does `router.refresh()` every 60s and shows a "Updated Ns ago" counter. Linked from the site footer (`src/app/(site)/layout.tsx`) alongside Updates / Privacy / Terms.
- `GET /api/cron/status-check` (`src/app/api/cron/status-check/route.ts`) — `CRON_SECRET` Bearer (re-checked in-route), calls `runStatusChecks()`, returns `{ checked, incidents }`. Runs every 5 min via `.github/workflows/health-check.yml` (renamed "Health & Status Checks"), which now has two cron schedules — the existing 12h provider `health-check` POST and the new 5-min status-check GET, gated per-step by `github.event.schedule` (manual `workflow_dispatch` runs both).

## Key Directories

| Path | Purpose |
|------|---------|
| `src/app/(site)/` | Public-facing pages (home, search, watch, anime detail, genres, issues) |
| `src/app/(auth)/` | Auth pages (login, account, Discord linking, password reset) |
| `src/app/admin/` | Admin dashboard (provider health, logs, issues, announcements, watch parties) |
| `src/app/api/` | All API route handlers |
| `src/components/` | Shared React components (player, nav, comments, episode list/sidebar, cards, announcement banner) |
| `src/providers/` | Thin adapter wrapping `core-dist`'s legacy providers for the admin health-check dashboard only |
| `src/lib/core-dist/` | Pre-built `@tsss/core` — rate limiting + legacy provider health checks. Do not edit directly |
| `prisma/schema.prisma` | DB schema (User, WatchHistory, Watchlist, Comment, CommentLike, SourceToken, ProviderStatus, ProviderLog, StatusIncident/StatusCheck, Issue, GenreVote, Announcement, WatchStreak, Follow, WatchParty, Badge/UserBadge/GenreCache/AiringWatch, Season/SeasonResult, ChatMessage/ChatTimeout/ChatChannel, Changelog) |

## Data Fetching Patterns

- **Anime metadata**: AniList GraphQL via `src/lib/anilist.ts` (`searchAnime`, `getTrending`, `getSeasonal`, `getAnimeById`, `getAnimeByGenre`, `getDisplayTitle`, `getMainStudio`, `getEpisodeSchedule`)
- **Watch progress**: Dual-tracked — per authenticated user (`userId`) or per anonymous session (`sessionId`); stored as milliseconds in `WatchHistory`. `GET /api/progress` dedupes to one row per anime (latest episode) when returning history; with `?episodeId=...` it instead does an exact single-row lookup (same `{ history: [...] }` shape, 0–1 items) — used by the watch page for the resume position.
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
- `DISCORD_PUBLIC_KEY` / `DISCORD_APP_ID` — Discord slash-command interactions (`/api/discord/interactions` signature verification + `scripts/register-discord-commands.mjs`); see Watch Parties
- `VERCEL_BYPASS_SECRET` — Vercel deployment protection bypass (used in the Discord OAuth callback redirect)
- `DISCORD_WEBHOOK_URL` — provider health failure/recovery alerts
- `DISCORD_ALERT_WEBHOOK_URL` / `DISCORD_ALERT_USER_ID` — admin login / security alerts (Discord callback route)
- `DISCORD_UPDATES_WEBHOOK_URL` — changelog/updates channel posts (`sendChangelogPost`, see Changelog / Updates)
- `GITHUB_WEBHOOK_SECRET` — verifies `X-Hub-Signature-256` on `POST /api/webhooks/github` (see Changelog / Updates)
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
