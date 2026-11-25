# Task 06: the watch path (→ v0.6.0)

## Summary

You can now search for an anime, open its page and watch it. The anime page matches the approved mockup: banner,
tilting poster, status and airing countdown, your list status and star rating, the trailer, a sanitized description,
and tabs for episodes, characters and watch order. The Details card ends with one line, "Available on: Re:Anime ✓,
AniZone ✓", with a health dot per source. The watch page plays sub or dub from every server the sources offer. When a
server fails it moves on to the next by itself and tells you, and switching server or audio keeps your place.
Re:Anime's styled subtitles are drawn exactly as authored by libass (JASSUB). On top of that: resume ("Continue from
6:40?"), skip intro/outro, an up-next countdown that plays the next episode, theater mode, lights off, keyboard
shortcuts with a `?` sheet, and double-tap to seek on phones. Progress is saved to your account, or kept in the
browser if you're a guest.

Everything was tested end to end on the full stack on tsss-server: **14/14 passing**, task 05's 7 plus 7 new ones.
Real video comes through the relay, ASS subtitles are drawn, switching server and SUB↔DUB keeps the time, the resume
prompt appears after a reload, progress rows land in Postgres, and up next moves on to episode 2. Lighthouse scores
**accessibility 100** on both the anime page and the watch page. The Docker image went from **788 MB to 399 MB**.

Two decisions changed during the task, both by you:
- **Video.js 10.7 instead of Vidstack.** Vidstack was deprecated in October 2026 in favour of Video.js 10. JASSUB
  plugs in cleanly, but alongside Video.js rather than inside it. Video.js 10 has no hook for a custom subtitle
  renderer, and JASSUB doesn't need one (details below).
- **The image now uses a small migration runner instead of the Prisma CLI.** Keeping `prisma migrate deploy` in a
  slimmed stage couldn't get under 400 MB: the CLI needs about 200 MB even pruned. The runner writes exactly the rows
  Prisma writes, and I checked that you can switch back and forth.

Things to know:
- **Performance is 54** on both pages in Lighthouse's simulated slow phone. Most of it is JavaScript start-up (React
  and the player bundle) under the throttled CPU. Accessibility, best practices and SEO are all 100.
- One thing in `node_modules` is patched: a single line in JASSUB's worker, so the bundler leaves its WASM loader
  alone. It's committed as `patches/jassub@2.5.38.patch` and pnpm applies it on install. Remove it when JASSUB
  fixes this upstream.
- I installed Video.js's official Claude Code plugin as you asked (`claude plugin marketplace add videojs/skills`,
  `claude plugin install videojs@videojs`, user scope). It is in your global Claude settings, not this repo.

## What's built

### Search (`/search`)
- The query lives in the URL (`?q=`), a plain GET form, so it's shareable and Back works. The header search's Enter
  goes here.
- Up to 50 results in a poster grid with type, year, episode count and status. Filters for type, status and a year
  range, plus sorting (best match / newest / A–Z), all run in the browser because the API only takes `q` + `limit`.
- Skeletons while loading (`<Suspense key={q}>`), plus empty, no-match and error states with a retry. Keyboard
  friendly, with labelled controls.
- `isAdult === true` results are hidden unless `SHOW_ADULT=true` (default false). Absent means unknown and is shown,
  as the API notes say. The same rule applies to header suggestions.
- Poster hosts not in `IMAGE_HOSTS` fall back to the empty poster box instead of showing a broken image.

### Anime page (`/anime/[id]`)
- **Hero:** banner (falls back to a blurred cover), a poster with 3D mouse tilt and sheen (off under reduced motion
  and on devices without a fine pointer), title in the viewer's chosen language (new Settings → Titles: English /
  romaji / native, kept in a cookie so the server renders it for guests too), the other titles under it, status
  badge, airing countdown, chips, and SUB n / DUB n counts.
- **Actions:** Watch, which continues from your progress: "Continue · EP 5 · 14:32 left", "Watch next · EP 6", else
  "Watch · EP 1". Then a list status menu (Watching / Planning / Completed / Paused / Dropped / Remove), stored in
  `ListEntry` or guest storage. Then the trailer: YouTube opens a `youtube-nocookie.com` embed in a dialog, and the
  iframe only exists while the dialog is open, so nothing loads from YouTube before the click; Dailymotion trailers
  open on Dailymotion. Then copy link, with a toast.
- **Star rating:** 1–5 stars = `ListEntry.score` 20–100. Rating a show that isn't on your list puts it in Completed,
  and the toast says so.
- **Description:** sanitized on the server with `sanitize-html` using an allow-list (`b strong i em u br p a`; links
  only over http(s), opened with `rel="noopener noreferrer nofollow"`). Read more appears only when the text is long.
- **Tags:** spoiler tags hidden; adult tags hidden unless `SHOW_ADULT=true`.
- **Episodes tab:** list (thumbnail, title, SUB/DUB badges, progress bar) or number grid, oldest/newest first,
  watched and in-progress states, jump to episode (moves to the right range and focuses that episode), and ranges of
  100 for long shows. The list is merged across sources: an episode is SUB/DUB if any source has it so.
- **Characters** with their Japanese voice actor (English when there's no Japanese). **Watch order:** this show plus
  its direct relations (prequel, sequel, side story, spin-off and so on), oldest first, with the current one
  highlighted. AniList only gives one hop.
- **Details sidebar:** format, episodes × length, status, aired, season, studios, source, "Available on" with health
  dots, and "Watch legally" (AniList's STREAMING links plus the official site; only http(s) URLs are used).
- Recommendations row, per-page metadata (title, description, Open Graph image = cover), a real 404
  (`app/not-found.tsx`), and a friendly "try again" page when the API is down. A `503 anilist_cap` shows "Almost
  there… try again in a minute", never a 404.
- Not built (deferred, 1.32): comments, watch together, report a problem. The mockup's "Most popular" sidebar needs
  list endpoints, so it moves to 0.7.

### Watch page (`/watch/[id]/[ep]`)
- **Streams** come from `GET /api/streams/:id/:ep`. On the server it asks every source that has the episode, in
  each audio it offers, with the viewer's IP from `clientIp()`, and returns only relay URLs. `expiresAt` is watched:
  before the first play, the links are refetched 15 s before they expire.
- **Servers:** SUB and DUB rows as in the mockup (server name plus source). The DUB row says "No dub for this
  episode" when there is none. Switching keeps the current time (and keeps playing if it was playing). A server
  that errors, or doesn't load within 20 s, hands over to the next one: same audio first, in source order. A toast
  says "HD-2 didn't load. Trying HD-1." If every server fails you get a clear message and a retry.
- **Subtitles:** ASS goes through JASSUB; VTT goes in as a normal `<track>`; SRT is converted to VTT in the browser
  and goes in the same way. A Subtitles button in the player picks the track (or off), the size (S/M/L/XL) and the
  background. Size and background apply to text tracks; styled ASS keeps the look its file sets, and the panel says
  so.
- **Resume:** with saved progress (unfinished, past 15 s and not in the last 30 s) you get "Continue from mm:ss?"
  with Resume / Start over, or with the new Auto resume toggle on, it continues straight away.
- **Skip intro/outro:** uses the server's own times when it has them, else `/api/skip/:id/:ep?duration=` with the
  stream's real length (the API notes stress this). With Auto skip on, it skips without a click.
- **Up next:** from the outro start (or the last 10 s) a card shows the next episode with a 10 s countdown ring, then
  plays it unless cancelled (Auto next toggle = the `autoplay` pref). Under reduced motion the ring isn't drawn;
  the number still counts.
- **Toggles bar:** Auto next, Auto skip, Auto resume, Theater (player full width, list below), Lights off (dark
  overlay; click or Esc to undo). Prev / Next buttons.
- **Keyboard:** space/k, j/l ±10 s, ←/→ ±5 s, f, m, t, c, n/p, `?`. One page-wide handler, so the keys work wherever
  focus is (but not while typing). It runs in the capture phase so the skin's own bindings don't act twice. Touch:
  the skin's double-tap left/right = ∓10 s.
- **Sidebar:** the compact episode list (current one highlighted, watched states) and an info card linking back to
  the anime page. **Mark watched** below the player.
- **Progress:** signed in, the `saveProgress` server action runs every 10 s while playing, on pause and at the end,
  and on `pagehide` / hidden tab it goes through `navigator.sendBeacon` to `POST /api/progress`. That route checks
  the Origin and uses the SameSite=Lax session. Guests use `writeGuest`, same shapes. An episode counts as completed
  at the outro start or 90 %, whichever comes first. The server throttles to one write per 5 s per
  user/anime/episode, except that becoming completed always goes through, and completed is never turned back off.
- **Episode out of range** (below 1, or above AniList's count or the last aired episode) gives a 404. An episode in
  range that no source has gets a message ("They have episodes 1–27…") and a link back to the anime page.

### Platform
- **CSP:** added only `'wasm-unsafe-eval'` (JASSUB's WebAssembly; it doesn't allow `eval`) and
  `frame-src https://www.youtube-nocookie.com` (trailer dialog). The relay was already in `media-src` /
  `connect-src`, and `worker-src blob:` was already there. Every AniList, AniSkip and API call stays server-side.
  I also turned off zod 4's one-time `new Function` probe in the browser (`z.config({ jitless: true })`). The CSP
  blocked it anyway, but it logged a violation and cost Lighthouse best-practices points.
- **Per-IP rate limits:** `/api/search` 60/min, streams and skip 30/min. They're kept **in memory** (fixed one-minute
  windows), not in the database. They only have to stop one visitor hammering the API, a restart forgetting them is
  harmless, they cost nothing per request, and the site is one process. If it ever runs as several replicas, move
  them to Better Auth's `rateLimit` table (noted in a `shortcut:` comment).
- **Header nav:** Home, Search.
- **Responsive:** checked at 375 / 768 / 1024 / 1440 on all three pages: no horizontal overflow, every control at
  least 44 px except inline text links, nothing that needs hover (the skip/up-next/subtitle buttons are always
  tappable). On phones the player has no title inside it, so it can't cover the overlays.

## Player choices

- **Video.js 10.7.0** (`@videojs/react` + `@videojs/hlsjs-video`, which bundles hls.js 1.7; no CDN loads), using
  the packaged **Default skin**, restyled through its public CSS variables to the monochrome look. Speed, quality
  (HLS levels) and VTT captions are in the skin's own settings menu. Before writing it I installed Video.js's
  coding-agent plugin and followed its Migrate-from-Vidstack guide and the bundled docs.
- **How JASSUB is wired:** Video.js 10.7 has no custom caption renderer and reads WebVTT only (its guide lists both
  as known gaps). So JASSUB runs **alongside** it. The site takes the `<video>` element from `HlsJsVideo`'s `ref`,
  and for an ASS track creates `new JASSUB({ video, subUrl })`. JASSUB puts its own canvas right after the video,
  inside the skin's container, so it follows fullscreen and resizing. The canvas sits above the control bar
  (`z-index: 31`; the skin's controls are 30) so a line is never hidden behind it. It ignores the pointer, so
  every control still works. The instance is destroyed on track or server change.
- **One patch:** JASSUB 2.5.38's worker loads its WASM glue with a runtime `import()` wrapped in a helper, so the
  bundler's ignore comment never reached the import and Turbopack replaced it with a stub that throws. The patch
  puts `/* webpackIgnore */ /* turbopackIgnore */` on the import itself. It's one line, and the browser's native
  import then works.
- Our own overlays (resume, skip, up next, the subtitle panel, the shortcuts sheet) live **inside** the skin's
  container rather than in portals, so they also work in fullscreen.

## Tests (machine noted per line)

| Check | Result |
|---|---|
| `biome check .` (PC) | clean, 114 files |
| `tsc --noEmit` (PC) | clean |
| `vitest run` (PC) | **43/43** in 12 files. New: sanitizer, search filters/sort, progress rules (completion point, continue target, guest put, write throttle), skip-time choice, server fallback, shortcuts map, SRT→VTT, rate limiter, migration runner (plan + Prisma's checksum), CSP |
| `next build` (PC, no env at all) | OK |
| E2E, full stack on **tsss-server** (site image built from this code, Postgres 17, RECONSUMΣT.TS 0.6.0 API + relay, Mailpit), Chromium on the PC through an SSH tunnel | **14/14 passing** on the final build |
| Lighthouse 13.6 (Chrome on the PC, same stack) | see below |
| Migration runner vs Prisma CLI (tsss-server, Postgres 17) | see "Image size" |

New e2e tests (`e2e/watch.spec.ts`):
1. header search → `/search` → anime page → "Watch · EP 1" → `currentTime` advances, and the source is an MSE blob
   (relay), never a third-party URL;
2. JASSUB canvas sized to the video, and **not empty**: with the video hidden, a screenshot with the canvas is
   clearly larger than one without it at the same moment;
3. Skip intro (server times 0–90 s), then HD-2 → HD-1 → DUB → SUB, each keeping the time (±3 s, plus slack for
   playback during the switch);
4. guest: pause saves to `localStorage`, reload → "Continue from 6:4x?" → Resume;
5. `?` sheet, `l` +10 s, `t` theater, `k` pause/play; seek to the outro → "Up next" with the ring → `/watch/…/2`;
6. signed in (email sign-up through Mailpit): the progress row for episode 3 is in Postgres;
7. reduced motion: no poster tilt, no countdown ring.

Task 05's passkey test failed at first on the new build, and it wasn't a regression. The virtual authenticator answers
the sign-in page's passkey autofill so quickly that it signs in before the test clicks the button. The test now
accepts either path; both are passkey sign-ins.

Watch tests send no fake `X-Forwarded-For`. Playwright adds extra headers to *every* request, which turned the
cross-origin HLS requests into CORS preflights the relay refused. That's a test-harness note, not a site bug.

Bandwidth: the e2e suite plays a few seconds at each seek point, so about a minute of video per run.

### Lighthouse 13.6 (final build, PC, simulated mobile)

| Page | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| `/anime/154587` | 54 | **100** | 100 | 100 |
| `/watch/154587/1` | 54 | **100** | 100 | 100 |

Performance under the throttled CPU: anime page LCP 4.5 s, TBT 4.1 s, CLS 0. Watch page LCP 5.2 s, TBT 1.5 s, CLS
0.06. FCP is about 1 s on both and the server answers in 100–150 ms. The time goes to JavaScript start-up: the
shared React/Next chunk (229 KB) and, on the watch page, Video.js + hls.js (900 KB, loaded only there). The anime
page's HTML is also large (about 270 KB with the RSC payload).

## Image size

| | Listed (`docker image ls`) | Unpacked layers |
|---|---|---|
| Before (0.5.0 Dockerfile + this code) | 788 MB | 612 MB |
| **After** | **399 MB** | **≈ 300 MB** |

(Docker 29 on tsss-server uses the containerd image store; its listed size counts unpacked layers plus their
compressed copies. Task 05's 776 MB was the same measure.)

What changed:
1. **No Prisma CLI in the image** (it was 273 MB). First I tried the agreed route, `prisma migrate deploy` in a slim
   stage: Prisma Studio and `prisma dev` are loaded at start-up (removing them gives `Cannot find module
   '@prisma/studio-core/data/bff'`), so even pruned it needs about 200 MB, and the image couldn't get under 400 MB.
   So, as agreed, `server/migrate.mjs` (about 90 lines, on `pg`, already in the app) does the same job:
   - Prisma's advisory lock key (72707369), the same `_prisma_migrations` table, and the same rows: UUID id, checksum
     = SHA-256 of the file's bytes (unit-tested against the checksum Prisma stored), `finished_at`,
     `applied_steps_count` = 1, and `logs` on failure.
   - `migrate deploy` semantics: apply the pending ones in name order, each script as one implicit transaction, and
     refuse to continue after a failed migration (Prisma's P3009) until it's rolled back or fixed.
   - Checked on tsss-server against Postgres 17:
     - runner on a fresh database → applied; runner again → "no pending";
     - **the Prisma CLI on the runner-made database → "No pending migrations to apply."**;
     - the runner on a Prisma-made database → "no pending";
     - both databases have identical rows and an identical schema fingerprint (82 columns, same md5).
   - `pnpm db:migrate` (the Prisma CLI) still works from a checkout for development.
2. **Runtime base:** `debian:bookworm-slim` with only the official Node 26 binary copied in (plus `libatomic1`, the
   one library it needs that slim Debian lacks). No npm, corepack or headers at runtime. OpenSSL is gone too: only
   Prisma's schema engine needed it. Still any x86-64 and arm64 (the same official binary per platform).
3. The Dockerfile now copies `patches/` before `pnpm install` (the JASSUB patch).

## Known gaps

- **Subtitle size and background** apply to text tracks (VTT/SRT) only. Styled ASS keeps its own look (that's the
  point of libass). The mockup's single settings panel is split in two: speed and quality are in the skin's menu,
  the subtitle track, size and background in ours.
- While the controls are showing, a bottom ASS line is drawn over the control bar (above it, so it's readable). A
  fuller fix needs the skin source ("own the UI") to move the line up when controls show.
- In-player shortcut feedback: the skin's on-screen indicators don't show for the keys we handle ourselves (we take
  them in the capture phase so ←/→ can be 5 s and the keys work page-wide).
- The Video.js skin shows the banner as the poster, letterboxed on narrow screens.
- **Not e2e-tested:** quality switching, PiP, theater/lights off visually, a real phone's double-tap, the trailer
  dialog (it would load YouTube), Dailymotion trailers, SRT/VTT subtitle tracks (no source served one in the test
  shows), and the automatic fallback with a server that really fails (the logic is unit-tested; no source failed
  during the runs).
- Performance 54 on a throttled phone (above).
- Per-IP limits and the progress throttle are per process (fine for the supported single-container setup).
- arm64 is still built only by the release workflow (QEMU), not run.

## Commits

```
4e0e88e fix: give the site icon a title
0feabd2 chore(deps): RECONSUMET.TS 0.6.0; Video.js 10, hls.js, JASSUB, sanitize-html
0880a0a feat(search): search page with filters and sort, per-IP limit, SHOW_ADULT
538c2fe feat(anime): anime page with episodes, characters, watch order, list status, rating and trailer
e4e7b72 chore: commit the AGENTS.md that next dev writes; format pnpm-workspace
f51ed14 feat(watch): watch page with Video.js 10 + hls.js, JASSUB subtitles, server fallback, resume, skip, up next
fef1ce8 test(e2e): watch path: playback, JASSUB, server switch, resume, up next, shortcuts, reduced motion
7d7d25f fix: 44 px targets, no player title on phones, skip only once playing, drop off-list image hosts
4d7ae74 feat(docker): Prisma-compatible migration runner on pg; runtime image 788 → 399 MB
3ffd6c6 fix: no zod eval probe under the CSP; watch page description; passkey e2e tolerates autofill sign-in
bda7b55 fix(watch): draw ASS subtitles above the control bar
1ae26e3 docs: README status and screenshots for 0.6
…       docs: task 06 report
…       chore(release): 0.6.0   (tag v0.6.0)
```

`AGENTS.md` is written by `next dev` (Next 16.4) and re-added whenever it's missing; its own note says to commit it.

## Push

```sh
cd thesupersuperanime.lol
git push origin master
git push origin v0.6.0
```

The tag push runs `release.yml` → `ghcr.io/thesupersupersigma/thesupersuperanime:0.6.0` + `:latest`.

## Cleanup done

On tsss-server: the e2e stack is down with its volume removed. The images I built or pulled are removed (site,
RECONSUMΣT.TS 0.6.0 API + relay, Postgres 17, Mailpit, `debian:bookworm-slim`, `node:26-bookworm-slim`), and the
temp folder `~/tsss06` is deleted. Docker's shared build cache was left alone. On the PC: temp scripts and the dev
`.env.local` are deleted, and the SSH tunnels are closed.

## Suggested `brainstorm.md` edits

- **1.28 item 3:** "Player: **Video.js 10** (Vidstack was deprecated Oct 2026 in favour of it; user decision
  2026-11-24) + **JASSUB**. Video.js 10 has no custom caption renderer and reads WebVTT only, so JASSUB draws ASS on
  its own canvas over the `<video>`; VTT/SRT go through normal text tracks."
- **1.32:** "Site 0.6.0 done: search, anime page, watch page as in the mockups (minus comments / watch together /
  report). Server fallback, resume, AniSkip with the real stream length, up next, theater, lights off, shortcuts.
  Progress throttled server-side. Image 788 → 399 MB: a Prisma-compatible migration runner on `pg` replaced the
  Prisma CLI (the slim-stage route couldn't get under 400 MB because Prisma loads Studio at start-up), and the
  runtime is Debian slim + the Node binary only."
- **1.31:** add "per-IP limits for search/streams are in memory (one process); the progress write throttle too."
- **New (third-party code):** "JASSUB 2.5.38 carries a one-line pnpm patch (`patches/`) so Turbopack leaves its
  worker's WASM import alone; drop it when fixed upstream."

## For task 07 (home, schedule, lists)

- Reuse: `EpisodeList`, `UserAnimeProvider` (progress/list for any page), `titleOf` + the `title` cookie,
  `allowedImage`, `continueTarget` (a "Continue watching" row is that function over all of a user's progress), and
  `STATUSES` from `components/anime/hero.tsx` for list pages.
- The anime page's "Most popular" sidebar and the mockup's Browse need list endpoints. Add them to RECONSUMΣT.TS
  first (trending/popular/top/airing schedule from AniList through the same budgets).
- `NAV` in `components/shell/header.tsx`: add Browse and Schedule.
- Guest `prefs` now also has `titleLang`, `autoResume` and `subtitleBg`.
- Perf: the anime page's HTML (≈ 270 KB with the RSC payload) is the next thing to slim if Lighthouse matters, e.g.
  render the Characters / Watch order tabs on demand.

## Going live on your own server

Nothing new is required. What your private `.env` should have:
- `RECONSUMET_VERSION` unset (defaults to 0.6.0) or `0.6.0`; `SITE_VERSION` unset (0.6.0) or pinned.
- `RELAY_PUBLIC_URL` = the relay's public https address; the relay's `RELAY_ALLOWED_ORIGINS` follows `SITE_URL`
  automatically in compose.
- `TRUSTED_PROXIES` / `CLIENT_IP_HEADER` for your Coolify/Cloudflare path. This now matters more: streams are sealed
  per viewer IP and the per-IP limits use it. A wrong value puts every viewer in one rate-limit bucket.
- Optional: `SHOW_ADULT=true` if you want adult titles; `IMAGE_HOSTS` if you add image sources (the default now
  includes `img1.ak.crunchyroll.com` for episode thumbnails).
- Bandwidth: every viewer's video goes through the relay, so your upload sets how many can watch at once. I didn't
  measure a stream's bitrate in this task; a typical 1080p HLS stream is several Mbit/s.
- The existing database migrates by itself on start with the new runner. It reads the `_prisma_migrations` rows the
  0.5.0 image wrote and has nothing to apply (no schema change in 0.6).
