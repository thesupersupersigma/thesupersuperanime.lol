# TASKS — post-audit fixes (main site)

Work through these in order. **Commit after each numbered task**, not in one batch —
a month of infrastructure work was recently lost to an unbacked-up VM, so nothing
valuable sits uncommitted. Push when finished.

## Context you need

- **There is no live deployment.** The VM hosting both this site and the scraper API
  (`api.thesupersuperanime.lol`) was lost. Anything calling the scraper API will fail —
  that's expected, not a finding. Neon Postgres is externally managed and may still be
  reachable. `next dev` runs locally.
- **Verify what you genuinely can** — unit-level, offline, by reading code, or against
  Neon if reachable. When something can only be confirmed against a live deployment,
  say so plainly rather than claiming success you can't demonstrate.
- **Baseline:** `npx tsc --noEmit` exits 0 and `eslint` exits 0 (16 warnings). Any new
  error is yours.
- These findings come from a thorough audit with adversarial verification. Line numbers
  are verifier-corrected but may have shifted — confirm before editing rather than
  trusting them blindly.

## COMMIT YOUR TESTS — not just the source changes

A parallel pass on the sibling repo (RECONSUMET-TS) just hit this and it's worth not
repeating. Every fix there was reported with real verification — "52/52 unit tests
pass", "36 differential payloads" — but only source files were committed. **The tests
lived in scratch scripts and were thrown away.** A second session had to rebuild all of
them from scratch to confirm anything, and while doing so discovered one of the four
"verified" fixes had never actually worked.

So: any test you write to verify a fix goes in the repo as a real, committed file that
can be re-run later. If a test genuinely can't be committed (needs a live deployment,
needs credentials), say so explicitly in your report rather than writing a throwaway
script and describing its output as proof.

Related, from that same pass: **a confident verification report can still be wrong.**
Where a fix is important, prefer a test that would fail loudly if the fix were reverted,
over a test that merely exercises the happy path.

---

## 1. H4 — second account on same browser can never save progress (permanent silent 500)

**File:** `web/src/app/api/progress/route.ts:112` (+ same class at `api/watchlist/route.ts:41`)

Highest priority because it's **gate-independent and has been silently breaking real
users**. The upsert keys on `userId_episodeId`, but its create branch still writes
`sessionId`, guarded by a second unique index `@@unique([sessionId, episodeId])`. The
pre-clean only deletes `userId: null` rows, and `destroyUserSession()` never rotates
`session-id` (a 1-year cookie).

Sequence: User A watches ep 1 → signs out → User B signs in on the same browser →
create branch → `P2002` → **500 on every save for that episode, forever.** It never
self-heals. `anime-player.tsx:243` swallows it (`catch {}`, never checks `res.ok`), so
B silently loses resume, history, streaks, and every WatchHistory badge.

**Fix:** the upsert and the unique constraints must not be able to disagree. Decide
whether `sessionId` still belongs on authenticated rows at all; rotate `session-id` on
sign-out; make the pre-clean handle the real collision case. Also fix the swallowed
error at `anime-player.tsx:243` (see task 3 — it's on the log list).

**Verify:** reproduce the A→sign-out→B sequence against a real DB if Neon is reachable;
otherwise prove it via the schema + code path and unit-test the upsert logic.

---

## 2. The two `/api/source` provider-pairing bugs (the "ReAnime randomly disappears" symptom)

**File:** `web/src/app/api/source/route.ts`

Two **independent** causes of the same long-standing symptom. Fix both.

**2a — response keyed under the requested provider, not the answering one (`:218-224`, `:228`)**
Secondary `/episodes` responses close over the *requested* name and re-emit it;
`data.provider` is never read anywhere in the file. If the aggregator answers
`?provider=reanime` with an AniNeko body, that list is stored under `"reanime"`, `:245`
emits an AniNeko-shaped `episodeId` (`solo-leveling-1234/ep-1`), `:255` sends it to
`/watch?provider=reanime` → 400 → swallowed at `:258` → ReAnime silently vanishes.

The primary path at `:211-213` already does this correctly off `primaryEps.provider`,
which proves the API reports who answered — this path just discards it.

Fix: `const answered = (data.provider ?? requested).toLowerCase(); if (answered !== requested.toLowerCase()) continue;`

**2b — `providerQueue.slice(1)` drops the top provider when the primary call fails (`:215`)**
`slice(1)` assumes index 0 was already fetched. When the primary `/episodes` call fails,
times out, or returns `provider: null`, index 0 is `info.mappings[0]` — the
**highest-scored** provider — and it never gets an episode list, so `:241` drops it.
With a single mapping that's a hard 404 on a perfectly healthy provider.

Fix: `providerQueue.filter(p => !episodesByProvider.has(p.provider.toLowerCase()))`

**Verify:** unit-test both paths with mocked responses — a mismatched `data.provider`,
and a failed/null primary — confirming the healthy provider survives in the second case.

---

## 3. Silent-failure logging across the site

The audit's single strongest theme: on every network boundary, `r.ok ? r.json() : null`
plus unlogged `catch` makes a thrown config error, a 15s AbortError, and a genuinely
empty result **indistinguishable in logs and on the wire**. This is why a real outage
couldn't be diagnosed.

Add the log lines below. **Logging only — do not change what callers receive**, except
where explicitly noted (the `fallbackReason` in the 404 body, and `res.ok` checks that
currently don't exist).

| Where | Level | Line |
|---|---|---|
| `api/source/route.ts:60` | error | `[/api/source] fetchScraper threw { animeId, episodeNum, fallbackReason, errName, errMessage, stack }` |
| `api/source/route.ts:66` | error | `[/api/source] 404 no streams { animeId, episodeNum, fallbackReason }` — **and return `fallbackReason` in the body**, which the success path at `:153` already does |
| `api/source/route.ts:171,173,222,258` | error | `[source] upstream non-OK { animeId, episodeNum, endpoint, provider, status, statusText }` |
| `api/source/route.ts:176,226` | error | `[source] upstream fetch rejected { …, errName: res.reason?.name, errMessage: res.reason?.message }` — rejected settlements never read `.reason` today |
| `api/source/route.ts:228` | warn | `[api/source] provider mismatch { animeId, requested, answered }` ← task 2a |
| `api/source/route.ts:211` | warn | `[api/source] primary /episodes empty { animeId, queueHead, reason }` ← task 2b |
| `api/source/route.ts:166` | error | `[/api/source] SCRAPER_API_URL is not set` — a config error currently masquerades as a 404 |
| `api/source/route.ts:264` | error (was `console.log`) | promote the existing watch-failure line off info level |
| `api/progress/route.ts:176` | error | `[api/progress] upsert failed { userId, episodeId, sessionId, code }` — a P2002 must not look like a blip |
| `anime-player.tsx:243` | warn | `[player] progress save rejected { status, episodeId }` — **it ignores `res.ok` entirely** |
| `watch-client.tsx:125,197` | error | `[watch] source fetch failed { animeId, episodeNum, status, body }` |
| `lib/anilist.ts:379` | error | `[anilist] getAnimeById failed { animeId, errName, errMessage }` |
| `chat/[roomId]/stream:72` (+2 siblings) | error | `[sse] poll failed, terminating stream { route, roomId, err }` — then release + close |
| `chat/[roomId]/stream` (new catch) | error | `[sse/chat] start() failed, releasing slot { roomId, active }` |
| `ChatPanel.tsx:83` | error | add `es.onerror` → `[chat] SSE error { roomId, readyState }` — there is none today |
| `comments.tsx:97,104,129,322` | error | `[comments] request failed { op, animeId, commentId, status, body }` |
| `watch-party-sync.tsx:54,63` | error (first failure only) | `[watch-party] host sync push failed { roomCode, status }` |
| `importers/anikai.ts:263,270` | error + warn | per-entry resolve failure + `[import] dropped N of M entries` |
| `anilist/sync/auto:24` | error | `[anilist/sync/auto] user sync failed { userId, errName, errMessage }` |
| `lib/discord.ts:44` | error (was warn) | `DISCORD_WEBHOOK_URL not set — provider alerts are disabled` |
| `anime-player.tsx:432` | warn | `[aniskip] non-2xx { malId, episodeNum, status }` — distinguishes an API break from "no skip data" |

**Also fix while here (SF-07, real bug not just logging):** all three SSE routes do
`catch { clearInterval(interval); }` with no close and no release. The 25s keepalive
keeps firing, so `EventSource` never errors and never reconnects — the client sits on a
healthy-looking dead socket. Worse, the initial queries sit **outside** any try, so a
throw in `start()` errors the stream without invoking `cancel()` → `activeConnections`
leaks toward the 300 cap and stays there until redeploy. Fix the release/close on both
paths.

**Caution:** any error-formatting helper you write must itself be incapable of throwing.
`String(e)` throws on null-prototype objects and on values with a throwing `toString`.
A sibling repo hit exactly this — a formatter inside a graceful-degradation catch turned
a 200-with-empty-result into a 502. Test hostile throwable shapes explicitly.

---

## 4. H1 — auth gate passes on mere presence of a cookie

**File:** `web/src/proxy.ts:154`

`const userId = req.cookies.get("user-session")?.value;` then `if (!userId)` block.
**Truthy = pass.** Edge can't reach Postgres, so the value is never validated —
`document.cookie = "user-session=x"` walks past the gate.

Both claimed backstops fail for an anonymous forgery: `(site)/layout.tsx:18-24` only
redirects when `user !== null`, and `discord-gate-check.tsx:24-27` bails silently on the
401. The same forged cookie also reaches `POST /api/source`, which has **no in-route
auth at all**.

This is **not** a restatement of the session-impersonation bug already fixed —
`getCurrentUser()` rejects the forgery correctly; nothing on this path calls it.

**Fix:** make the cookie edge-verifiable (`<token>.<HMAC>`) so proxy.ts can validate
without a DB round-trip, **and** add a real `requireAuth()` to `/api/source`.

**Must land before the password gate is ever turned off.**

---

## 5. H2 — `/api/source` rate limit is trivially bypassed and the limiter never evicts

**File:** `web/src/app/api/source/route.ts:46` and `core-dist/lib/rate-limit.js:23-25`

Key is `session-id ?? site-auth ?? "anonymous"`. A client rotating `session-id` gets a
fresh bucket every request — the limit does nothing against anyone who wants to bypass it.

Worse for legitimate users: `"anonymous"` is the **normal first-visit case**.
`watch-client.tsx:175` fires `/api/progress` and `:187` fires `/api/source` in the same
tick, so `Set-Cookie` can't land first — **every first-time visitor shares one bucket**,
and the 11th new visitor in 60s gets a 429 rendered as "No playable streams found."
That's a launch-day failure mode.

Separately, `rate-limit.js:23-25` tests `timestamps.length === 0` *after* pushing, so the
delete is unreachable and the Map grows forever.

**Fix:** key on something the client can't rotate (IP + a server-set value); fix the
eviction check.

---

## 6. H3 — video proxy playlist branch is an uncapped DB write amplifier

**File:** `web/src/app/api/proxy/[token]/route.ts:157`

One `SourceToken` row per playlist line — no cap, no `skipDuplicates`, fresh
`randomBytes(24)` per pass so replays never collide. `/api/proxy` returns before every
gate, and playlist tokens are `isM3U8` so the `used` check never applies — one token is
replayable for its full 3h.

Normal use: 250–1000 rows per episode view at ~600 bytes = **150–600 MB per 1000 views**.
Neon going read-only takes down auth, chat, and watchlists — not just playback.

**Fix:** derive the segment `tokenId` from `HMAC(parentTokenId + segmentURL)` so replays
are idempotent, and cap the line count.

**Also in this task — M14, same whole-site-down class:** `api/subtitle-proxy/route.ts:80`
does `await res.text()` with **no byte cap** on a public, unauthenticated, unrated route.
Hundreds of MB buffered in RAM → OOM. Reachable by anyone today. Add a byte cap. (The
host allowlist itself is correct — leave it alone.)

---

## 7. M8 — the status page monitors a service that isn't in the pipeline

**File:** `web/src/lib/status.ts:91,123,133`

`pingAnivexa` reads `ANIVEXA_API_URL || "http://64.181.222.197:4000"` — the dead VM IP,
over plain HTTP — while the actual pipeline reads `SCRAPER_API_URL`. **Zero overlap.**
Live DB shows `service='anivexa'` at 380 fail / 7 ok with an open incident since
2026-06-21. A provider registry pinned to `anitaku.to`/`aniwave.to` (dead since 2024)
independently forces `broken→outage`.

Net effect: `/status` reports **Major Outage permanently** from two wrong sources, while
a real scraper outage produces **no signal at all**. This is why the "Anivexa outage" was
dismissed as a stale monitoring entry months ago — it was, and it never got fixed.

**Fix:** monitor `SCRAPER_API_URL` (the service actually in the pipeline); drop or update
the dead provider registry; a missing env var should surface as a **config error**, not
an outage. Purge the bogus incident history if practical.

---

## 8. Cheap wins — do these last, they're quick

- **`ignoreBuildErrors: true` is suppressing nothing.** `tsc --noEmit` and `eslint` both
  exit 0 today, and `ci.yml` already runs both (which contradicts `CLAUDE.md:22`). Flip
  it to `false` — free safety, since the Dockerfile never typechecks.
- **`web/CLAUDE.md:54` documents deleted code.** The entire "Video Source Pipeline
  (Anivexa)" section is wrong: wrong env var, wrong base URL, all three endpoint paths
  wrong, a `PROVIDER_PRIORITY` that exists only in the doc, a `mirrorUsed` field the route
  never returns. `:30`'s legacy registry (kiwi/ally/arc/zoro/jet/bee) should be
  gogoanime/aniwave. Rewrite that section to match reality.
- **`DISCORD_WEBHOOK_URL` is absent from `.env.example`** while the comment at `:85-86` is
  attached to the wrong variable — so provider health alerting silently early-returns on
  every invocation. Add it.

---

## Explicitly OUT of scope

Do not do these in this pass:

- Deleting dead code (`source-loader.tsx`, `core-dist/dist/**`, the `mirrorUsed`/
  `fallbackReason` chain, etc.) — worth doing, but it's a separate cleanup pass and
  mixing it in makes these fixes harder to review.
- The remaining M-series not named above (M3, M4, M5/M6, M7, M9, M10, M11/M12, M13, M15,
  M16, M17, M19, M20, M21, M22).
- The agent-discovery 404s (MCP endpoint, `/watch`, `/anime`, `/user`, the `robots.txt`
  `Disallow: /api/` conflict) — real, but they only matter once redeployed.
- Anything requiring a live deployment.

---

## When finished

Per task: what you changed, what you verified and how, and — importantly — what you
could **not** verify and why. Flag anything you had to assume. Then push.
