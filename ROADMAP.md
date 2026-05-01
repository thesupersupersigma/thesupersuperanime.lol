# thesupersuperanime.lol — Project Roadmap

## The Stack

| Layer | Tool | Cost |
|---|---|---|
| Frontend + API routes | Next.js on Vercel | Free |
| DNS + DDoS protection | Cloudflare | Free |
| Domain | Porkbun (.lol) | Already paid |
| Database | Neon (Postgres) | Free tier |
| Anime metadata | AniList GraphQL API | Free |
| Auth | Clerk or Lucia | Free tier |

> **Future scaling:** When ready to go public, migrate backend/scraper to Hetzner VPS (~€3.29/mo) behind Cloudflare. Vercel stays for the frontend forever.

---

## Repo Structure

Two repos, always:

```
thesupersuperanime-web        ← can be public
├── Frontend UI
├── AniList metadata layer
├── Video player
├── Watch history / watchlist
└── Public-facing API routes

thesupersuperanime-core       ← ALWAYS PRIVATE
├── Provider implementations
├── Decryption / source logic
├── Proxy + signed URL architecture
└── Canary dashboard backend
```

> **Rule:** Nothing in `core` ever touches a public repo. Contributor fixes come in as patches/DMs via Discord, not public PRs.

---

## Security Model

- **Password middleware** on every route while in private beta (3 users)
- **Signed expiring URLs** — video source URLs expire in 60 seconds, tied to user session + IP. Browser never sees the real origin URL.
- **Stream proxying** — all video traffic routes through your API, never exposing the upstream host
- **No file hosting ever** — scraper finds where files live, never stores them
- **Closed source scraper** — provider logic stays private permanently
- **Cloudflare in front of everything** — your real server IP is never exposed

```typescript
// middleware.ts — password lock for private beta
export function middleware(req: NextRequest) {
  const auth = req.cookies.get('site-auth')
  if (!auth || auth.value !== process.env.SITE_PASSWORD) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}
```

---

## AI Assistant Strategy

| Task | Model |
|---|---|
| Initial scaffold + architecture | Claude Opus (one time) |
| Database schema design | Claude Opus |
| Provider interface design | Claude Opus |
| Proxy/signing architecture | Claude Opus |
| Scraper reverse engineering | Claude Opus |
| UI components | Claude Sonnet |
| AniList integration | Claude Sonnet |
| Player setup | Claude Sonnet |
| Day-to-day feature building | Claude Sonnet |
| Second opinions when stuck | Gemini with high thinking |

---

## Phase 1 — Foundation
**Target: 1 weekend | Model: Opus for scaffold, Sonnet after**

### Goals
- Working Next.js app on Vercel
- Password locked (private beta)
- AniList metadata working
- Basic UI shell

### Tasks
- [ ] Init Next.js 15 project with TypeScript + Tailwind + shadcn
- [ ] Set up Cloudflare DNS pointing at Vercel
- [ ] Password middleware on all routes
- [ ] `/login` page
- [ ] Neon Postgres instance + Prisma schema
- [ ] AniList GraphQL client
- [ ] Homepage with trending/seasonal anime (from AniList)
- [ ] Search page
- [ ] Anime detail page (title, cover, description, episode list)
- [ ] Basic dark mode UI
- [ ] `.env` hygiene + `.gitignore` set up before first commit

### Database Schema (initial)
```prisma
model User {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  watchlist Watchlist[]
  history   WatchHistory[]
}

model WatchHistory {
  id        String   @id @default(cuid())
  userId    String
  animeId   String   // AniList ID
  episodeId String
  progress  Int      // seconds watched
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}

model Watchlist {
  id      String @id @default(cuid())
  userId  String
  animeId String
  user    User   @relation(fields: [userId], references: [id])
}
```

### Folder Structure
```
src/
├── app/
│   ├── (auth)/login/
│   ├── (site)/
│   │   ├── page.tsx          ← homepage
│   │   ├── search/
│   │   ├── anime/[id]/
│   │   └── watch/[id]/[ep]/
│   └── api/
│       ├── source/           ← scraper endpoint (private)
│       └── progress/         ← watch progress sync
├── lib/
│   ├── anilist.ts            ← GraphQL client
│   ├── db.ts                 ← Prisma client
│   └── auth.ts
├── providers/                ← NEVER public
│   ├── base.ts
│   ├── gogoanime.ts
│   └── zoro.ts
└── middleware.ts             ← password lock
```

---

## Phase 2 — Canary Dashboard
**Target: Week 2 | Model: Sonnet**

### Goals
- Internal health monitor at `/admin`
- Know immediately when a provider breaks
- Discord alerts automated

### Tasks
- [ ] `/admin` route (separate password from main site)
- [ ] Provider status grid (🟢 🟡 🔴)
- [ ] Latency tracking per provider (ms to get a valid source)
- [ ] Last successful scrape timestamp per provider
- [ ] Consecutive failure counter
- [ ] Discord webhook integration
- [ ] GitHub Actions cron job — health check every 30 minutes

### Discord Alert Format
```
🚨 Provider BROKEN: GogoAnime
Error: Selector `.ep-item-2026` not found
Consecutive failures: 3
Last success: 2h ago
Fix needed → DM @you or drop a patch in #dev-fixes
```

### Rate Limiting (add here, not later)
```typescript
// Basic rate limit before scraper gets any real traffic
const rateLimit = {
  windowMs: 60 * 1000,   // 1 minute window
  max: 10                 // 10 source requests per user per minute
}
```

---

## Phase 3 — Scraper Core
**Target: Weeks 2–3 | Model: Opus for architecture + decryption**

### Goals
- Working video source retrieval
- Multiple providers with fallback
- Signed expiring URLs
- Stream proxied through your server

### The Provider Pattern
```typescript
// base.ts — this interface design is the part worth Opus tokens
interface Provider {
  id: string
  displayName: string
  search(query: string): Promise<SearchResult[]>
  getEpisodes(animeId: string): Promise<Episode[]>
  getSources(episodeId: string): Promise<Source[]>
}

interface Source {
  url: string        // the m3u8 or mp4 URL
  quality: string    // "1080p" | "720p" | "360p"
  subtitles: Sub[]
  provider: string
}
```

### Concurrent Provider Racing
```typescript
// Hit 3 providers at once, take the first valid response
const sources = await Promise.any([
  providers.gogoanime.getSources(episodeId),
  providers.zoro.getSources(episodeId),
  providers.backup.getSources(episodeId),
])
```

### Signed URL Flow
```
User clicks Watch
    ↓
POST /api/source { episodeId, userId }   ← auth required
    ↓
Server runs scraper internally (never exposed)
    ↓
Server returns signed URL (expires 60s, tied to IP + session)
    ↓
Player fetches /api/proxy/[token]
    ↓
Server validates token, pipes stream to player
    ↓
Browser never sees real upstream URL
```

### Provider Priority (start simple, add complexity)
1. **Streamtape** — start here, simpler URL structure, no heavy decryption
2. **GogoAnime** — medium complexity
3. **Zoro/HiAnime** — hardest, AES-encrypted sources, tackle last

### Subtitle Pipeline
```
Episode airs in Japan
    ↓
SubsPlease/Erai-raws releases .ass file (same day, free)
    ↓
Scraper grabs subtitle URL alongside video source
    ↓
Convert .ass → .vtt server-side
    ↓
Player renders with libass-wasm (styled subs, not plain white)
```

> SubsPlease covers ~95% of currently airing shows automatically.
> AI subs (Whisper) only needed for the 1% with no fansub — run on-demand, not on every episode.

---

## Phase 4 — Player
**Target: Week 3 | Model: Sonnet**

### Goals
- Beautiful, functional video player
- HLS adaptive streaming
- Styled subtitles
- Auto-resume

### Tasks
- [ ] Vidstack or Plyr integration (both beautiful out of the box)
- [ ] HLS.js for adaptive bitrate streaming
- [ ] Quality selector (auto/1080p/720p/360p)
- [ ] WebVTT subtitle rendering
- [ ] libass-wasm for styled .ass subtitles
- [ ] Auto-resume from watch history
- [ ] Skip intro / skip outro buttons
- [ ] Keyboard shortcuts (space, arrows, f for fullscreen)
- [ ] Mobile-friendly controls

### Error Handling (critical)
```typescript
// Never show a white screen — always fall back gracefully
<ErrorBoundary
  fallback={<TryNextProvider onRetry={fetchNextSource} />}
>
  <VideoPlayer src={signedUrl} />
</ErrorBoundary>
```

---

## Phase 5 — The Features That Make It 100x Better
**Target: Ongoing | Model: Sonnet**

These are the gaps existing sites don't fill. Prioritize by impact:

### High Impact
- [ ] **AniList/MAL sync** — users can sync watch progress to their AniList account
- [ ] **Zero-refresh episode drops** — Socket.io pushes new episode notifications live
- [ ] **Mobile-first UI** — existing sites have terrible mobile UX, this is a real gap
- [ ] **No ads** — self-explanatory, this alone beats every competitor

### Medium Impact
- [ ] **Watch Party** — synchronized playback rooms via WebRTC (no server-side video relay needed)
- [ ] **Episode timestamps** — community-submitted skip intro/outro/recap markers
- [ ] **Continue Watching** — prominent on homepage, cross-device via Neon DB
- [ ] **Discord integration** — episode discussions tied to your Discord server

### Nice to Have
- [ ] **Recommendation engine** — based on AniList tags + watch history
- [ ] **Seasonal calendar** — what's airing this week, with countdown timers
- [ ] **Whisper AI subs** — on-demand only for episodes with no existing fansub (run on cheap GPU instance, cents per episode)

---

## The Community Loop (Discord)

```
Provider breaks (3 consecutive failures)
        ↓
Discord webhook fires to #dev-alerts
        ↓
Trusted contributor submits patch via DM
        ↓
You review, apply, push
        ↓
Vercel auto-deploys in ~30 seconds
        ↓
Status light goes green, webhook confirms
```

**Trusted Contributor Model:**
- No public scraper repo
- Earn private repo access by submitting good patches
- Small rewards: Discord roles, credits on site, crypto tips

---

## What Never Changes (Hard Rules)

1. **Never host video files** — find where they live, never store them
2. **Never expose scraper logic publicly** — not even "educational" versions
3. **Never build Ghost Mode** — proxying arbitrary user traffic = liability for everything they do
4. **Cloudflare in front of everything always** — real server IP never exposed
5. **Signed expiring URLs always** — browser never sees upstream source
6. **`.env` never touches git** — set this up before the first commit, not after

---

## Go-Public Checklist (when you're ready to scale)

- [ ] Migrate scraper/backend to Hetzner VPS (€3.29/mo)
- [ ] Remove password middleware
- [ ] Set up proper user auth (Clerk)
- [ ] Rate limiting hardened
- [ ] Error monitoring (Sentry free tier)
- [ ] Uptime monitoring (Better Uptime free tier)
- [ ] Have a second domain ready to rotate to if needed
- [ ] Offshore VPS confirmed (Hetzner Finland or Contabo)