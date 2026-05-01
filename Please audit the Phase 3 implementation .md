Please audit the Phase 3 implementation of my anime streaming site project. Do NOT rewrite or change anything — just review and report issues, bugs, or missing pieces.

Here is the original spec the code was written against:
# Phase 3 Build Prompt — Scraper Core

> Paste this entire prompt to Claude Opus (Antigravity) to build Phase 3.
> Phases 1 and 2 must be complete before starting this.
> This is the most complex phase — read everything before starting.

---

## Repo Structure

This project has two separate repos:

```
thesupersuperanime.lol/
├── web/     ← Next.js frontend + API routes (public repo)
└── core/    ← Scraper logic (PRIVATE repo, never public)
```

**The split for Phase 3:**

| What | Where |
|---|---|
| Provider implementations | `core/src/providers/` |
| Extractor implementations | `core/src/lib/extractors/` |
| Rate limiter | `core/src/lib/rate-limit.ts` |
| Smart fetch helper | `core/src/lib/fetch.ts` |
| `/api/source` route | `web/src/app/api/source/` |
| `/api/proxy/[token]` route | `web/src/app/api/proxy/[token]/` |
| Prisma schema update | `web/prisma/schema.prisma` |

`core/` is a local npm package imported by `web/`. Scraper logic never lives in `web/` directly.

---

## Critical Rules Before Starting

1. **Never log raw source URLs** — log only provider name, latency, and success/fail status
2. **Never expose source URLs to the browser** — always proxy through `/api/proxy/[token]`
3. **Never commit real source URLs to git** — they appear only in memory at runtime
4. **The scraper runs server-side only** — no client components touch this code
5. **All scraper logic lives in `core/`** — `web/` only contains API routes that call core
6. **Do not touch any existing Phase 1 or Phase 2 files** except `middleware.ts` and `prisma/schema.prisma`

---

## Step 0 — Set Up core/ as a Local NPM Package

Before writing any scraper code, set up `core/` as a proper TypeScript npm package:

### `core/package.json`

```json
{
  "name": "@tsss/core",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "playwright": "latest",
    "playwright-extra": "latest",
    "playwright-extra-plugin-stealth": "latest",
    "crypto-js": "latest"
  },
  "devDependencies": {
    "@types/crypto-js": "latest",
    "@types/node": "latest",
    "typescript": "latest"
  }
}
```

### `core/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `core/src/index.ts` — public exports

```typescript
// Everything web/ needs from core is exported here
export { getRacedSources, providers } from './providers/index'
export type { EpisodeSource, VideoSource, Subtitle, BaseProvider } from './providers/base'
```

### Add core to web's dependencies

In `web/package.json`, add to dependencies:

```json
"@tsss/core": "file:../core"
```

Then run:

```bash
cd core && npm install && npm run build
cd ../web && npm install
```

---

## Architecture Overview

```
User clicks Watch episode
        ↓
POST /api/source (web/)
        ↓
Calls getRacedSources() from @tsss/core
        ↓
┌─────────────────────────────────────┐
│           core/ (private)           │
│                                     │
│  GogoAnimeProvider                  │
│    → smartFetch(episode page)       │
│    → extract iframe src             │
│    → StreamtapeExtractor            │
│      → fetch embed page             │
│      → string manipulation          │
│      → returns raw m3u8 URL         │
│                                     │
│  AniWaveProvider (concurrent)       │
│    → smartFetch(episode page)       │
│    → AJAX sources endpoint          │
│    → S3takuExtractor                │
│      → fetch embed page             │
│      → AES decrypt                  │
│      → returns raw m3u8 URL         │
└─────────────────────────────────────┘
        ↓
First successful source wins
        ↓
web/ signs + stores token in Neon DB
        ↓
Returns { token, quality, isM3U8 } to browser
        ↓
Player hits GET /api/proxy/[token] (web/)
        ↓
web/ validates token, pipes stream
        ↓
Browser streams video — never sees real URL
```

---

## Part 1 — Base Provider Interface

Create `core/src/providers/base.ts`:

```typescript
export interface VideoSource {
  url: string           // raw stream URL (never sent to browser)
  quality: string       // "1080p" | "720p" | "480p" | "360p" | "auto"
  isM3U8: boolean       // true for HLS, false for mp4
  subtitles: Subtitle[]
}

export interface Subtitle {
  url: string
  lang: string          // "English", "Japanese", etc.
  format: 'vtt' | 'srt' | 'ass'
}

export interface EpisodeSource {
  sources: VideoSource[]
  provider: string
  latencyMs: number
}

export interface ProviderCheckResult {
  success: boolean
  latencyMs: number
  error?: string
}

export interface BaseProvider {
  id: string
  displayName: string

  // Find the provider-specific episode ID for a given anime + episode number
  findEpisodeId(animeTitle: string, episodeNum: number): Promise<string | null>

  // Get video sources for a provider-specific episode ID
  getSources(episodeId: string): Promise<EpisodeSource>

  // Health check — used by Phase 2 canary dashboard
  // Test with Naruto episode 1 (stable, always exists)
  check(): Promise<ProviderCheckResult>
}
```

---

## Part 2 — Smart Fetch Helper

Create `core/src/lib/fetch.ts`:

```typescript
// Fetch first, fall back to Playwright if Cloudflare blocks us
// This is the only place Playwright is imported

async function smartFetch(url: string, referer?: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(referer ? { 'Referer': referer } : {}),
      },
      signal: AbortSignal.timeout(8000),
    })

    const html = await res.text()

    // Detect Cloudflare challenge page
    if (
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment') ||
      html.includes('Checking your browser') ||
      res.status === 403
    ) {
      throw new Error('Cloudflare challenge detected')
    }

    return html
  } catch {
    // Fall back to Playwright with stealth
    return playwrightFetch(url)
  }
}

async function playwrightFetch(url: string): Promise<string> {
  const { chromium } = await import('playwright-extra')
  const StealthPlugin = (await import('playwright-extra-plugin-stealth')).default
  chromium.use(StealthPlugin())

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'en-US',
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
    return await page.content()
  } finally {
    await browser.close()
  }
}

export { smartFetch, playwrightFetch }
```

---

## Part 3 — GogoAnime Provider

Create `core/src/providers/gogoanime.ts`:

### How GogoAnime/Anitaku Works

```
Search:  https://anitaku.to/search.html?keyword=naruto
Episode: https://anitaku.to/naruto-episode-1
Player:  iframe src pointing to https://s3taku.com/embed/{id}
         or https://embtaku.pro/embed/{id}
```

### Implementation

**`findEpisodeId(animeTitle, episodeNum)`:**
1. `smartFetch('https://anitaku.to/search.html?keyword={encoded title}')`
2. Parse HTML — find `.items .img a` or `ul.items li .img a` href attributes
3. Pick the closest title match (simple includes check, case insensitive)
4. Extract the anime slug from the href (e.g. `/category/naruto` → `naruto`)
5. Return `/{slug}-episode-{episodeNum}`

**`getSources(episodeId)`:**
1. `smartFetch('https://anitaku.to' + episodeId, 'https://anitaku.to')`
2. Find all `<iframe>` src attributes in the HTML
3. Filter for known video host domains (s3taku.com, embtaku.pro, streamtape.com)
4. Pass each to `extractSource()` from the extractor registry
5. Return first non-null result

**`check()`:**
1. Call `findEpisodeId('Naruto', 1)`
2. If found, call `getSources(id)`
3. Return `{ success: sources.length > 0, latencyMs }`

---

## Part 4 — AniWave Provider

Create `core/src/providers/aniwave.ts`:

### How AniWave Works

```
Search:  https://aniwave.to/filter?keyword=naruto
Anime:   https://aniwave.to/watch/naruto.abc123
Sources: GET https://aniwave.to/ajax/episode/sources?id={episodeDataId}
```

AniWave loads episode data via AJAX — the page HTML alone won't have the video sources.

**`findEpisodeId(animeTitle, episodeNum)`:**
1. `smartFetch('https://aniwave.to/filter?keyword={title}')`
2. Parse search results, find anime link + data-id
3. Fetch episode list: `GET /ajax/episode/list/{animeId}` with JSON headers
4. Parse the episode list HTML fragment returned in JSON
5. Find episode matching `episodeNum`, return its `data-id`

**`getSources(episodeId)`:**
1. `fetch('https://aniwave.to/ajax/episode/sources?id=' + episodeId)`
   with headers: `{ 'X-Requested-With': 'XMLHttpRequest' }`
2. Parse JSON response — contains array of server objects with embed URLs
3. Pass each embed URL to `extractSource()` from extractor registry
4. Return first successful result

**`check()`:**
1. Call `findEpisodeId('Naruto', 1)`
2. If found, call `getSources(id)`
3. Return `{ success: sources.length > 0, latencyMs }`

---

## Part 5 — Provider Registry

Create `core/src/providers/index.ts`:

```typescript
import { GogoAnimeProvider } from './gogoanime'
import { AniWaveProvider } from './aniwave'
import type { BaseProvider, EpisodeSource } from './base'

export const providers: BaseProvider[] = [
  new GogoAnimeProvider(),
  new AniWaveProvider(),
]

// Race all providers — return first successful result
// If all fail, Promise.any rejects with AggregateError
export async function getRacedSources(
  animeTitle: string,
  episodeNum: number
): Promise<EpisodeSource> {
  return Promise.any(
    providers.map(async p => {
      const id = await p.findEpisodeId(animeTitle, episodeNum)
      if (!id) throw new Error(`[${p.id}] Episode not found`)
      const result = await p.getSources(id)
      if (result.sources.length === 0) throw new Error(`[${p.id}] No sources extracted`)
      return result
    })
  )
}
```

---

## Part 6 — Base Extractor Interface

Create `core/src/lib/extractors/base.ts`:

```typescript
import type { VideoSource, Subtitle } from '../providers/base'

export interface ExtractorResult {
  sources: VideoSource[]
  subtitles: Subtitle[]
  latencyMs: number
}

export interface BaseExtractor {
  // Domains this extractor handles
  domains: string[]

  // Extract stream URL from an embed URL
  extract(embedUrl: string): Promise<ExtractorResult>

  // Returns true if this extractor can handle the given URL
  canHandle(url: string): boolean
}
```

---

## Part 7 — Streamtape Extractor

Create `core/src/lib/extractors/streamtape.ts`:

### How Streamtape Works

No AES encryption — just two string fragments in the page HTML that get concatenated.

The page contains something like:
```html
<div id="robotlink">/streamtape.com/get_video?id=abc&expires=123&ip=x&token=frag1</div>
<script>
  document.getElementById('robotlink').innerHTML = 
    document.getElementById('robotlink').innerHTML + ('?frag2here').substring(4)
</script>
```

**Implementation:**
1. `fetch('https://streamtape.com/e/{videoId}')` — plain fetch, no Playwright needed
2. Use regex to extract `robotlink` div content (fragment 1)
3. Use regex to extract the substring argument from the script tag (fragment 2)
4. Apply the substring(4) operation to fragment 2
5. Concatenate: `'https://streamtape.com' + fragment1 + fragment2_result`
6. Return as `VideoSource` with `quality: 'auto'`, `isM3U8: false`

Note: Streamtape URL patterns change occasionally — if regex breaks, inspect
the embed page source and update the regex patterns. The two-fragment pattern
has been stable for years but the exact variable names change.

---

## Part 8 — S3taku Extractor

Create `core/src/lib/extractors/s3taku.ts`:

### How S3taku Works

S3taku (GogoAnime's primary host, also operates as embtaku.pro) uses AES-CBC encryption.

```
Step 1: GET https://s3taku.com/embed/{id}
        — Extract three values from the HTML:
          a. The encrypted key (in a data attribute or script variable)
          b. The IV (initialization vector)
          c. The encrypted sources JSON string

Step 2: Decrypt the sources string using CryptoJS AES-CBC
        Key: hardcoded secret (extracted from their JS bundle)
        IV:  extracted from the page

Step 3: Parse the decrypted JSON
        → Array of { file: string, label: string, type: string }

Step 4: Return as VideoSource array with quality from label
```

**AES Implementation:**

```typescript
import CryptoJS from 'crypto-js'

// ============================================================
// HOW TO EXTRACT/UPDATE THESE KEYS WHEN THEY ROTATE:
//
// 1. Open https://s3taku.com/embed/{any-valid-id} in browser
// 2. Open DevTools → Sources → search for the JS bundle
//    (usually named something like 'enc-ajax.js' or similar)
// 3. Search the bundle for: CryptoJS.AES.decrypt
// 4. Near that call you will find two string literals:
//    - The encryption key (usually 32 chars)
//    - The IV (usually 16 chars)
// 5. They may be obfuscated — look for string concatenation
//    or character code arrays being joined
// 6. To verify: copy the encrypted sources from the page,
//    attempt decryption with your extracted key — if you get
//    valid JSON with a "file" property, the key is correct
// 7. Update ENCRYPTION_KEY and IV below
//
// Rotation frequency: typically every 2-8 weeks
// When broken: canary dashboard will show S3taku as RED
// ============================================================

const ENCRYPTION_KEY = 'REPLACE_WITH_EXTRACTED_KEY'
const IV = 'REPLACE_WITH_EXTRACTED_IV'

function decryptSources(encrypted: string): VideoSource[] {
  try {
    const keyBytes = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY)
    const ivBytes = CryptoJS.enc.Utf8.parse(IV)
    const decrypted = CryptoJS.AES.decrypt(encrypted, keyBytes, {
      iv: ivBytes,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })
    const json = decrypted.toString(CryptoJS.enc.Utf8)
    const parsed = JSON.parse(json)
    
    return parsed.map((s: { file: string; label: string; type: string }) => ({
      url: s.file,
      quality: s.label || 'auto',
      isM3U8: s.file.includes('.m3u8') || s.type === 'hls',
      subtitles: [],
    }))
  } catch (err) {
    // Decryption failed — key has likely rotated
    // Check canary dashboard and update ENCRYPTION_KEY + IV above
    throw new Error('S3taku decryption failed — key may have rotated')
  }
}
```

---

## Part 9 — Extractor Registry

Create `core/src/lib/extractors/index.ts`:

```typescript
import { StreamtapeExtractor } from './streamtape'
import { S3takuExtractor } from './s3taku'
import type { BaseExtractor, ExtractorResult } from './base'

const extractors: BaseExtractor[] = [
  new StreamtapeExtractor(),
  new S3takuExtractor(),
]

export function getExtractor(embedUrl: string): BaseExtractor | null {
  return extractors.find(e => e.canHandle(embedUrl)) ?? null
}

export async function extractSource(embedUrl: string): Promise<ExtractorResult | null> {
  const extractor = getExtractor(embedUrl)
  if (!extractor) {
    console.error(`[extractor] No extractor found for: ${new URL(embedUrl).hostname}`)
    return null
  }

  try {
    const result = await Promise.race([
      extractor.extract(embedUrl),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Extractor timeout after 10s')), 10000)
      ),
    ])
    return result
  } catch (err) {
    // Log hostname only — never log the full URL
    console.error(`[extractor] Failed for ${new URL(embedUrl).hostname}:`, (err as Error).message)
    return null
  }
}
```

---

## Part 10 — Rate Limiter

Create `core/src/lib/rate-limit.ts`:

```typescript
// Simple in-memory rate limiter
// In-memory is fine since this runs server-side
// Resets on server restart — acceptable for this use case

const requests = new Map<string, number[]>()

export function checkRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60_000
): boolean {
  const now = Date.now()
  const timestamps = (requests.get(key) ?? []).filter(t => now - t < windowMs)

  if (timestamps.length >= maxRequests) return false

  timestamps.push(now)
  requests.set(key, timestamps)
  return true
}
```

---

## Part 11 — core/src/index.ts (Public Exports)

```typescript
export { getRacedSources, providers } from './providers/index'
export { checkRateLimit } from './lib/rate-limit'
export type {
  EpisodeSource,
  VideoSource,
  Subtitle,
  BaseProvider,
  ProviderCheckResult,
} from './providers/base'
```

---

## Part 12 — Update web/prisma/schema.prisma

Add this model to the existing schema in `web/prisma/schema.prisma`:

```prisma
model SourceToken {
  id        String   @id @default(cuid())
  token     String   @unique
  url       String   // AES encrypted at rest using ENCRYPTION_SECRET env var
  sessionId String
  ip        String
  quality   String
  isM3U8    Boolean  @default(true)
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([token])
  @@index([expiresAt])
}
```

After updating: `cd web && npx prisma db push`

---

## Part 13 — web/src/app/api/source/route.ts

```
POST /api/source
Body: { animeTitle: string, episodeNum: number, animeId: number }
Auth: requires site-auth cookie (already handled by middleware)
Rate limit: 10 requests per minute per session

Flow:
1. Get sessionId from cookie, get IP from headers
2. Check rate limit via checkRateLimit(sessionId) from @tsss/core
3. Call getRacedSources(animeTitle, episodeNum) from @tsss/core
4. If AggregateError (all providers failed) → return 503
5. For each VideoSource:
   a. Encrypt the URL with AES using ENCRYPTION_SECRET env var
   b. Generate signed token: HMAC-SHA256(tokenId + expiresAt, TOKEN_SECRET)
   c. Store SourceToken in Neon DB
6. Return: { sources: [{ token, quality, isM3U8 }] }
   — raw URLs NEVER appear in the response
```

---

## Part 14 — web/src/app/api/proxy/[token]/route.ts

```
GET /api/proxy/[token]
No auth cookie required (token IS the auth)

Flow:
1. Look up token in DB
2. Validate:
   - Token exists
   - Not expired (expiresAt > now)
   - IP matches request IP
   - sessionId matches session cookie
   - For mp4: not already used
3. Decrypt the stored URL using ENCRYPTION_SECRET
4. For m3u8 (isM3U8 = true):
   - Fetch the m3u8 playlist from the decrypted URL
   - Rewrite all .ts chunk URLs in the playlist to go through /api/proxy/[new-token]
   - This means each chunk gets its own short-lived token
   - Return the rewritten playlist with Content-Type: application/x-mpegURL
5. For mp4 (isM3U8 = false):
   - Pipe the response stream directly using ReadableStream
   - Mark token as used immediately
   - Forward Range headers for seek support
   - Return with Content-Type: video/mp4
6. Set headers:
   - Access-Control-Allow-Origin: process.env.NEXT_PUBLIC_SITE_URL
   - Cache-Control: no-store
   - X-Content-Type-Options: nosniff
```

---

## Part 15 — Update web/package.json

Add to dependencies:
```json
"@tsss/core": "file:../core"
```

---

## Environment Variables to Add

In `web/.env.example` and `web/.env.local`:

```env
TOKEN_SECRET=           # random 32-char hex string — signs source tokens
ENCRYPTION_SECRET=      # random 32-char hex string — encrypts URLs in DB
```

Generate both with:
```bash
openssl rand -hex 32
```

---

## File Summary

| # | File | Repo | Status |
|---|---|---|---|
| 1 | `core/package.json` | core | NEW |
| 2 | `core/tsconfig.json` | core | NEW |
| 3 | `core/src/index.ts` | core | NEW |
| 4 | `core/src/providers/base.ts` | core | NEW |
| 5 | `core/src/providers/gogoanime.ts` | core | NEW |
| 6 | `core/src/providers/aniwave.ts` | core | NEW |
| 7 | `core/src/providers/index.ts` | core | NEW |
| 8 | `core/src/lib/fetch.ts` | core | NEW |
| 9 | `core/src/lib/rate-limit.ts` | core | NEW |
| 10 | `core/src/lib/extractors/base.ts` | core | NEW |
| 11 | `core/src/lib/extractors/streamtape.ts` | core | NEW |
| 12 | `core/src/lib/extractors/s3taku.ts` | core | NEW |
| 13 | `core/src/lib/extractors/index.ts` | core | NEW |
| 14 | `web/src/app/api/source/route.ts` | web | NEW |
| 15 | `web/src/app/api/proxy/[token]/route.ts` | web | NEW |
| 16 | `web/prisma/schema.prisma` | web | UPDATE |
| 17 | `web/package.json` | web | UPDATE |

---

## Build Order

Do these in order — do not skip steps:

```bash
# 1. Install core dependencies
cd core
npm install
npx playwright install chromium

# 2. Build core
npm run build

# 3. Install core into web
cd ../web
npm install

# 4. Push Prisma schema
npx prisma db push

# 5. Verify web still builds
npm run build
```

---

## Verification

After build passes:

1. Start dev server: `cd web && npm run dev`
2. POST to `/api/source` with body:
   ```json
   { "animeTitle": "Naruto", "episodeNum": 1, "animeId": 20 }
   ```
3. Response should be `{ sources: [{ token: "...", quality: "...", isM3U8: true }] }`
4. Raw URLs must NOT appear anywhere in the response
5. GET `/api/proxy/[token]` should begin streaming video bytes
6. Open browser Network tab — confirm no `s3taku.com` or `streamtape.com` URLs are visible
7. Check `/admin` dashboard — GogoAnime and AniWave should show real latency numbers

---

## What NOT to Build

- No video player UI (Phase 4)
- No subtitle rendering (Phase 4)
- No watch page UI (Phase 4)
- No changes to homepage, search, or anime detail pages
- No public documentation of scraper logic anywhere

---

## Important Notes for Opus

**Build Streamtape first.** Get one complete working pipeline — GogoAnime provider → Streamtape extractor → signed token → proxy endpoint — before touching S3taku. A working Streamtape pipeline proves the entire architecture is correct.

**The S3taku AES keys are placeholders.** The implementation should be complete and correct but the actual key values need to be manually extracted from S3taku's current JavaScript. Include the detailed extraction instructions as comments — this documentation is as important as the code itself.

**Never log full URLs anywhere.** Only log hostnames, provider names, latency, and error messages. This is a hard rule throughout all files.

**Give every file in full.** No truncation, no `// ... rest of implementation` placeholders. This phase is too interconnected for partial files to be useful.

Here are all the core/ files:
TSSS:thesupersuperanime.lol thesupersupersigma$ find core/src -type f -name "*.ts" | xargs -I {} sh -c 'echo "=== {} ===" && cat {}'
=== core/src/types/stealth.d.ts ===
declare module "playwright-extra-plugin-stealth" {
  import type { BrowserPlugin } from "playwright-extra";
  const StealthPlugin: () => BrowserPlugin;
  export default StealthPlugin;
}
=== core/src/providers/base.ts ===
export interface VideoSource {
  /** Raw stream URL — NEVER sent to browser, NEVER logged in plain text */
  url: string;
  /** "1080p" | "720p" | "480p" | "360p" | "auto" */
  quality: string;
  /** true for HLS (.m3u8), false for mp4 */
  isM3U8: boolean;
  subtitles: Subtitle[];
}

export interface Subtitle {
  url: string;
  /** "English", "Japanese", etc. */
  lang: string;
  format: "vtt" | "srt" | "ass";
}

export interface EpisodeSource {
  sources: VideoSource[];
  provider: string;
  latencyMs: number;
}

export interface ProviderCheckResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface BaseProvider {
  id: string;
  displayName: string;

  /**
   * Find the provider-specific episode ID for a given anime + episode number.
   * Returns null if the anime/episode was not found on this provider.
   */
  findEpisodeId(
    animeTitle: string,
    episodeNum: number
  ): Promise<string | null>;

  /**
   * Get video sources for a provider-specific episode ID.
   * The episode ID comes from findEpisodeId().
   */
  getSources(episodeId: string): Promise<EpisodeSource>;

  /**
   * Health check — used by Phase 2 canary dashboard.
   * Tests with Naruto episode 1 (stable, always exists).
   */
  check(): Promise<ProviderCheckResult>;
}
=== core/src/providers/gogoanime.ts ===
import { smartFetch } from "../lib/fetch";
import { extractSource } from "../lib/extractors/index";
import type {
  BaseProvider,
  EpisodeSource,
  ProviderCheckResult,
} from "./base";

const BASE_URL = "https://anitaku.to";

/**
 * GogoAnime / Anitaku Provider
 *
 * Flow:
 *   Search → Episode page → iframe src → Extractor (S3taku or Streamtape)
 *
 * Search URL:  https://anitaku.to/search.html?keyword=naruto
 * Episode URL: https://anitaku.to/naruto-episode-1
 * Player:      iframe src → https://s3taku.com/embed/{id}
 *                         or https://embtaku.pro/embed/{id}
 *                         or https://streamtape.com/e/{id}
 */
export class GogoAnimeProvider implements BaseProvider {
  id = "gogoanime";
  displayName = "GogoAnime";

  async findEpisodeId(
    animeTitle: string,
    episodeNum: number
  ): Promise<string | null> {
    const searchUrl = `${BASE_URL}/search.html?keyword=${encodeURIComponent(
      animeTitle
    )}`;
    const html = await smartFetch(searchUrl);

    // Parse search results — find links in the items list
    // Pattern: <ul class="items"><li>...<a href="/category/naruto">...</a>...</li>...
    const linkRegex =
      /<a\s+href=["'](\/category\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;
    const titleRegex =
      /<a\s+href=["']\/category\/[^"']+["'][^>]*title=["']([^"']+)["']/gi;
    const matches: Array<{ href: string; title: string }> = [];

    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      // Try to extract title from the same anchor or nearby
      const titleMatch = titleRegex.exec(html);
      if (titleMatch) {
        matches.push({ href, title: titleMatch[1] });
      } else {
        // Fall back: extract slug from href as the title
        const slug = href.replace("/category/", "").replace(/-/g, " ");
        matches.push({ href, title: slug });
      }
    }

    // If regex parsing didn't find anything, try a simpler approach
    if (matches.length === 0) {
      const simpleRegex = /href=["'](\/category\/[^"']+)["']/gi;
      let simpleMatch;
      while ((simpleMatch = simpleRegex.exec(html)) !== null) {
        const href = simpleMatch[1];
        const slug = href.replace("/category/", "").replace(/-/g, " ");
        matches.push({ href, title: slug });
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Find the closest title match (case-insensitive includes)
    const normalizedSearch = animeTitle.toLowerCase().trim();
    const bestMatch =
      matches.find((m) => m.title.toLowerCase().includes(normalizedSearch)) ??
      matches.find((m) =>
        normalizedSearch.includes(m.title.toLowerCase())
      ) ??
      matches[0]; // fall back to first result

    // Extract the anime slug from the category href
    // /category/naruto → naruto
    const slug = bestMatch.href.replace("/category/", "");

    // Construct episode URL path: /{slug}-episode-{num}
    return `/${slug}-episode-${episodeNum}`;
  }

  async getSources(episodeId: string): Promise<EpisodeSource> {
    const start = Date.now();
    const episodeUrl = `${BASE_URL}${episodeId}`;
    const html = await smartFetch(episodeUrl, BASE_URL);

    // Find all iframe src attributes — video embeds are in iframes
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    const embedUrls: string[] = [];
    let iframeMatch;
    while ((iframeMatch = iframeRegex.exec(html)) !== null) {
      let src = iframeMatch[1];
      // Normalize protocol-relative URLs
      if (src.startsWith("//")) src = `https:${src}`;
      embedUrls.push(src);
    }

    // Also check for direct link patterns in scripts
    // Some pages embed the source URL in a JavaScript variable
    const scriptSrcRegex =
      /(?:embedUrl|embed_url|player_url)\s*=\s*["']([^"']+)["']/gi;
    let scriptMatch;
    while ((scriptMatch = scriptSrcRegex.exec(html)) !== null) {
      let src = scriptMatch[1];
      if (src.startsWith("//")) src = `https:${src}`;
      embedUrls.push(src);
    }

    if (embedUrls.length === 0) {
      const latencyMs = Date.now() - start;
      return { sources: [], provider: this.id, latencyMs };
    }

    // Try each embed URL with extractors until one succeeds
    for (const embedUrl of embedUrls) {
      const result = await extractSource(embedUrl);
      if (result && result.sources.length > 0) {
        const latencyMs = Date.now() - start;
        return {
          sources: result.sources,
          provider: this.id,
          latencyMs,
        };
      }
    }

    const latencyMs = Date.now() - start;
    return { sources: [], provider: this.id, latencyMs };
  }

  async check(): Promise<ProviderCheckResult> {
    const start = Date.now();
    try {
      const episodeId = await this.findEpisodeId("Naruto", 1);
      if (!episodeId) {
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: "Naruto episode 1 not found in search",
        };
      }
      const result = await this.getSources(episodeId);
      return {
        success: result.sources.length > 0,
        latencyMs: Date.now() - start,
        error:
          result.sources.length === 0
            ? "No sources extracted from embed"
            : undefined,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
=== core/src/providers/aniwave.ts ===
import { smartFetch } from "../lib/fetch";
import { extractSource } from "../lib/extractors/index";
import type {
  BaseProvider,
  EpisodeSource,
  ProviderCheckResult,
} from "./base";

const BASE_URL = "https://aniwave.to";

/**
 * AniWave Provider
 *
 * AniWave loads episode data via AJAX — the page HTML alone won't have
 * the video sources. Episode data is fetched from their AJAX endpoints.
 *
 * Flow:
 *   Search → Anime page → AJAX episode list → AJAX episode sources → Extractor
 *
 * Search URL:    https://aniwave.to/filter?keyword=naruto
 * Anime page:    https://aniwave.to/watch/naruto.abc123
 * Episode list:  GET /ajax/episode/list/{animeDataId}
 * Sources:       GET /ajax/episode/sources?id={episodeDataId}
 */
export class AniWaveProvider implements BaseProvider {
  id = "aniwave";
  displayName = "AniWave";

  async findEpisodeId(
    animeTitle: string,
    episodeNum: number
  ): Promise<string | null> {
    // Step 1: Search for the anime
    const searchUrl = `${BASE_URL}/filter?keyword=${encodeURIComponent(
      animeTitle
    )}`;
    const searchHtml = await smartFetch(searchUrl);

    // Find anime links and their data-id attributes from search results
    // Pattern: <a href="/watch/naruto.abc123" ... data-id="12345">
    // or: <a href="/watch/naruto.abc123" ...>
    const animeLinks: Array<{
      href: string;
      title: string;
      dataId: string | null;
    }> = [];

    // Try to extract links with data-id
    const linkRegex =
      /<a[^>]+href=["'](\/watch\/[^"']+)["'][^>]*?(?:data-id=["']([^"']+)["'])?[^>]*>[\s\S]*?<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(searchHtml)) !== null) {
      // Extract title from nearby text or title attribute
      const titleAttr = match[0].match(/title=["']([^"']+)["']/);
      const textContent = match[0].replace(/<[^>]+>/g, "").trim();
      animeLinks.push({
        href: match[1],
        title: titleAttr ? titleAttr[1] : textContent,
        dataId: match[2] || null,
      });
    }

    // Simpler fallback: just find /watch/ hrefs
    if (animeLinks.length === 0) {
      const simpleRegex = /href=["'](\/watch\/[^"']+)["']/gi;
      let simpleMatch;
      while ((simpleMatch = simpleRegex.exec(searchHtml)) !== null) {
        const slug = simpleMatch[1]
          .replace("/watch/", "")
          .replace(/\.[^.]+$/, "")
          .replace(/-/g, " ");
        animeLinks.push({
          href: simpleMatch[1],
          title: slug,
          dataId: null,
        });
      }
    }

    if (animeLinks.length === 0) {
      return null;
    }

    // Find best match
    const normalizedSearch = animeTitle.toLowerCase().trim();
    const bestMatch =
      animeLinks.find((a) =>
        a.title.toLowerCase().includes(normalizedSearch)
      ) ??
      animeLinks.find((a) =>
        normalizedSearch.includes(a.title.toLowerCase())
      ) ??
      animeLinks[0];

    // Step 2: Fetch the anime page to get the anime data-id
    let animeDataId = bestMatch.dataId;

    if (!animeDataId) {
      const animePage = await smartFetch(`${BASE_URL}${bestMatch.href}`);
      // Look for data-id on the anime page
      // Pattern: data-id="12345" or id="watch-main" data-id="12345"
      const dataIdMatch = animePage.match(
        /(?:id=["']watch-main["'][^>]*)?data-id=["'](\d+)["']/
      );
      if (dataIdMatch) {
        animeDataId = dataIdMatch[1];
      }
    }

    if (!animeDataId) {
      return null;
    }

    // Step 3: Fetch episode list via AJAX
    const episodeListUrl = `${BASE_URL}/ajax/episode/list/${animeDataId}`;
    const episodeListRes = await fetch(episodeListUrl, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: `${BASE_URL}${bestMatch.href}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!episodeListRes.ok) {
      return null;
    }

    const episodeListData = (await episodeListRes.json()) as {
      result?: string;
    };
    const episodeListHtml = episodeListData.result ?? "";

    // Step 4: Find the episode matching episodeNum
    // Pattern: data-number="1" data-id="ep12345"
    //      or: data-num="1" data-id="ep12345"
    //      or: ep-num="1" ... data-id="12345"
    const episodeRegex = new RegExp(
      `data-(?:number|num|ep-num)=["']${episodeNum}["'][^>]*data-id=["']([^"']+)["']`,
      "i"
    );
    const epMatch = episodeListHtml.match(episodeRegex);

    if (epMatch) {
      return epMatch[1];
    }

    // Try reversed attribute order: data-id before data-number
    const reversedRegex = new RegExp(
      `data-id=["']([^"']+)["'][^>]*data-(?:number|num|ep-num)=["']${episodeNum}["']`,
      "i"
    );
    const reversedMatch = episodeListHtml.match(reversedRegex);

    return reversedMatch ? reversedMatch[1] : null;
  }

  async getSources(episodeId: string): Promise<EpisodeSource> {
    const start = Date.now();

    // Fetch sources via AJAX
    const sourcesUrl = `${BASE_URL}/ajax/episode/sources?id=${episodeId}`;
    const sourcesRes = await fetch(sourcesUrl, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: BASE_URL,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!sourcesRes.ok) {
      const latencyMs = Date.now() - start;
      return { sources: [], provider: this.id, latencyMs };
    }

    const sourcesData = (await sourcesRes.json()) as {
      result?: {
        url?: string;
        sources?: Array<{ url: string }>;
      };
    };

    // Extract embed URLs from the response
    const embedUrls: string[] = [];

    if (sourcesData.result?.url) {
      let url = sourcesData.result.url;
      if (url.startsWith("//")) url = `https:${url}`;
      embedUrls.push(url);
    }

    if (sourcesData.result?.sources) {
      for (const s of sourcesData.result.sources) {
        let url = s.url;
        if (url.startsWith("//")) url = `https:${url}`;
        embedUrls.push(url);
      }
    }

    if (embedUrls.length === 0) {
      const latencyMs = Date.now() - start;
      return { sources: [], provider: this.id, latencyMs };
    }

    // Try each embed URL with extractors
    for (const embedUrl of embedUrls) {
      const result = await extractSource(embedUrl);
      if (result && result.sources.length > 0) {
        const latencyMs = Date.now() - start;
        return {
          sources: result.sources,
          provider: this.id,
          latencyMs,
        };
      }
    }

    const latencyMs = Date.now() - start;
    return { sources: [], provider: this.id, latencyMs };
  }

  async check(): Promise<ProviderCheckResult> {
    const start = Date.now();
    try {
      const episodeId = await this.findEpisodeId("Naruto", 1);
      if (!episodeId) {
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: "Naruto episode 1 not found via AJAX",
        };
      }
      const result = await this.getSources(episodeId);
      return {
        success: result.sources.length > 0,
        latencyMs: Date.now() - start,
        error:
          result.sources.length === 0
            ? "No sources extracted from AJAX endpoint"
            : undefined,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
=== core/src/providers/index.ts ===
import { GogoAnimeProvider } from "./gogoanime";
import { AniWaveProvider } from "./aniwave";
import type { BaseProvider, EpisodeSource } from "./base";

export const providers: BaseProvider[] = [
  new GogoAnimeProvider(),
  new AniWaveProvider(),
];

/**
 * Race all providers — return first successful result.
 * Uses Promise.any so the fastest provider that returns
 * valid sources wins. All others are abandoned.
 *
 * If ALL providers fail, Promise.any rejects with AggregateError.
 */
export async function getRacedSources(
  animeTitle: string,
  episodeNum: number
): Promise<EpisodeSource> {
  return Promise.any(
    providers.map(async (p) => {
      const id = await p.findEpisodeId(animeTitle, episodeNum);
      if (!id) throw new Error(`[${p.id}] Episode not found`);
      const result = await p.getSources(id);
      if (result.sources.length === 0)
        throw new Error(`[${p.id}] No sources extracted`);
      return result;
    })
  );
}
=== core/src/lib/rate-limit.ts ===
/**
 * Simple in-memory rate limiter.
 * In-memory is fine since this runs server-side.
 * Resets on server restart — acceptable for this use case.
 */

const requests = new Map<string, number[]>();

/**
 * Check if a request is within rate limits.
 * Returns true if allowed, false if rate-limited.
 *
 * @param key      - Unique identifier (e.g. session ID)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs    - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const timestamps = (requests.get(key) ?? []).filter(
    (t) => now - t < windowMs
  );

  if (timestamps.length >= maxRequests) return false;

  timestamps.push(now);
  requests.set(key, timestamps);
  return true;
}
=== core/src/lib/extractors/base.ts ===
import type { VideoSource, Subtitle } from "../../providers/base";

export interface ExtractorResult {
  sources: VideoSource[];
  subtitles: Subtitle[];
  latencyMs: number;
}

export interface BaseExtractor {
  /** Domain patterns this extractor handles */
  domains: string[];

  /** Extract stream URL(s) from an embed URL */
  extract(embedUrl: string): Promise<ExtractorResult>;

  /** Returns true if this extractor can handle the given URL */
  canHandle(url: string): boolean;
}
=== core/src/lib/extractors/s3taku.ts ===
import CryptoJS from "crypto-js";
import type { VideoSource } from "../../providers/base";
import type { BaseExtractor, ExtractorResult } from "./base";

/**
 * S3taku / Embtaku Extractor
 *
 * S3taku (GogoAnime's primary video host, also operates as embtaku.pro)
 * uses AES-CBC encryption to protect the video source URLs.
 *
 * The page HTML contains:
 *   1. An encrypted data string (in a script tag or data attribute)
 *   2. The decryption requires a key + IV that are hardcoded in their
 *      JavaScript bundle (usually enc-ajax.js or similar)
 *
 * ============================================================
 * HOW TO EXTRACT/UPDATE THESE KEYS WHEN THEY ROTATE:
 *
 * 1. Open https://s3taku.com/embed/{any-valid-id} in browser
 * 2. Open DevTools → Sources → search for the JS bundle
 *    (usually named something like 'enc-ajax.js' or similar)
 * 3. Search the bundle for: CryptoJS.AES.decrypt
 * 4. Near that call you will find two string literals:
 *    - The encryption key (usually 32 chars)
 *    - The IV (usually 16 chars)
 * 5. They may be obfuscated — look for string concatenation
 *    or character code arrays being joined
 * 6. To verify: copy the encrypted sources from the page,
 *    attempt decryption with your extracted key — if you get
 *    valid JSON with a "file" property, the key is correct
 * 7. Update ENCRYPTION_KEY and IV below
 *
 * Rotation frequency: typically every 2-8 weeks
 * When broken: canary dashboard will show S3taku as RED
 * ============================================================
 */

// These keys must be manually extracted from S3taku's JS bundle.
// See extraction instructions above.
const ENCRYPTION_KEY = "REPLACE_WITH_EXTRACTED_KEY";
const IV = "REPLACE_WITH_EXTRACTED_IV";

/**
 * Decrypt an AES-CBC encrypted sources string from S3taku.
 */
function decryptSources(encrypted: string): VideoSource[] {
  try {
    const keyBytes = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
    const ivBytes = CryptoJS.enc.Utf8.parse(IV);
    const decrypted = CryptoJS.AES.decrypt(encrypted, keyBytes, {
      iv: ivBytes,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const json = decrypted.toString(CryptoJS.enc.Utf8);

    if (!json || json.length === 0) {
      throw new Error("Decryption produced empty result");
    }

    const parsed = JSON.parse(json);

    return parsed.map(
      (s: { file: string; label: string; type: string }) => ({
        url: s.file,
        quality: s.label || "auto",
        isM3U8: s.file.includes(".m3u8") || s.type === "hls",
        subtitles: [],
      })
    );
  } catch (err) {
    // Decryption failed — key has likely rotated
    // Check canary dashboard and update ENCRYPTION_KEY + IV above
    throw new Error(
      `S3taku decryption failed — key may have rotated: ${
        err instanceof Error ? err.message : "unknown"
      }`
    );
  }
}

export class S3takuExtractor implements BaseExtractor {
  domains = [
    "s3taku.com",
    "embtaku.pro",
    "embtaku.com",
    "gogoplay.io",
    "gogoplay4.com",
    "gogohd.net",
    "gogohd.pro",
    "playgo1.cc",
  ];

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.domains.some(
        (d) => hostname === d || hostname.endsWith(`.${d}`)
      );
    } catch {
      return false;
    }
  }

  async extract(embedUrl: string): Promise<ExtractorResult> {
    const start = Date.now();

    // Fetch the embed page
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: embedUrl,
      },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    // ── Extract the encrypted data ────────────────────────────────────────────
    // S3taku stores encrypted source data in a script tag or data attribute.
    // Common patterns:
    //   data-value="ENCRYPTED_STRING"
    //   var encrypted = "ENCRYPTED_STRING"
    //   enc_data = "ENCRYPTED_STRING"
    //
    // We try multiple patterns to be resilient to minor page changes.

    let encryptedData: string | null = null;

    // Pattern 1: data-value attribute on a script/div element
    const dataValueMatch = html.match(
      /data-value\s*=\s*["']([A-Za-z0-9+/=]+)["']/
    );
    if (dataValueMatch) {
      encryptedData = dataValueMatch[1];
    }

    // Pattern 2: JavaScript variable assignment
    if (!encryptedData) {
      const varMatch = html.match(
        /(?:enc_data|encrypted|data)\s*=\s*["']([A-Za-z0-9+/=]+)["']/
      );
      if (varMatch) {
        encryptedData = varMatch[1];
      }
    }

    // Pattern 3: AJAX response embedded in the page (crypto_value)
    if (!encryptedData) {
      const cryptoMatch = html.match(
        /crypto_value\s*[:=]\s*["']([A-Za-z0-9+/=]+)["']/
      );
      if (cryptoMatch) {
        encryptedData = cryptoMatch[1];
      }
    }

    if (!encryptedData) {
      throw new Error(
        "S3taku: encrypted data not found in page HTML — page structure may have changed"
      );
    }

    // ── Decrypt and parse ─────────────────────────────────────────────────────
    const sources = decryptSources(encryptedData);

    if (sources.length === 0) {
      throw new Error("S3taku: decryption succeeded but no sources found");
    }

    const latencyMs = Date.now() - start;

    // Extract subtitles if present
    const subtitleMatches = [
      ...html.matchAll(
        /(?:track|subtitle).*?src\s*=\s*["']([^"']+)["'].*?(?:label|srclang)\s*=\s*["']([^"']+)["']/gi
      ),
    ];
    const subtitles = subtitleMatches.map((m) => ({
      url: m[1],
      lang: m[2],
      format: "vtt" as const,
    }));

    return {
      sources,
      subtitles,
      latencyMs,
    };
  }
}
=== core/src/lib/extractors/streamtape.ts ===
import type { BaseExtractor, ExtractorResult } from "./base";

/**
 * Streamtape Extractor
 *
 * Streamtape uses a two-fragment URL construction pattern:
 * 1. A div with id="robotlink" contains fragment 1
 * 2. A nearby script tag contains fragment 2 via substring manipulation
 * 3. Concatenating both fragments yields the final video URL
 *
 * No AES encryption — just string manipulation obfuscation.
 * The two-fragment pattern has been stable for years but the exact
 * variable names and regex targets may change occasionally.
 */
export class StreamtapeExtractor implements BaseExtractor {
  domains = ["streamtape.com", "streamtape.net", "streamtape.xyz"];

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.domains.some(
        (d) => hostname === d || hostname.endsWith(`.${d}`)
      );
    } catch {
      return false;
    }
  }

  async extract(embedUrl: string): Promise<ExtractorResult> {
    const start = Date.now();

    // Fetch the embed page — plain fetch works, no Playwright needed
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: embedUrl,
      },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    // ── Extract fragment 1 from the robotlink div ─────────────────────────────
    // Pattern: <div id="robotlink" ...>FRAGMENT1</div>
    // The content is a partial URL path like:
    //   /streamtape.com/get_video?id=xxx&expires=yyy&ip=zzz&token=aaa
    const robotLinkMatch = html.match(
      /id\s*=\s*["']robotlink["'][^>]*>([^<]+)<\//
    );
    if (!robotLinkMatch) {
      throw new Error("Streamtape: robotlink div not found");
    }
    const fragment1 = robotLinkMatch[1].trim();

    // ── Extract fragment 2 from the script tag ────────────────────────────────
    // Pattern: document.getElementById('robotlink').innerHTML = ... + ('FRAGMENT2').substring(N)
    // We need to find the string and the substring offset
    const scriptMatch = html.match(
      /getElementById\s*\(\s*['"]robotlink['"]\s*\)[\s\S]*?\+\s*\('([^']+)'\)\.substring\((\d+)\)/
    );
    if (!scriptMatch) {
      throw new Error("Streamtape: script fragment not found");
    }
    const rawFragment2 = scriptMatch[1];
    const substringOffset = parseInt(scriptMatch[2], 10);
    const fragment2 = rawFragment2.substring(substringOffset);

    // ── Construct the final URL ───────────────────────────────────────────────
    const videoUrl = `https:${fragment1}${fragment2}`;

    const latencyMs = Date.now() - start;

    return {
      sources: [
        {
          url: videoUrl,
          quality: "auto",
          isM3U8: false,
          subtitles: [],
        },
      ],
      subtitles: [],
      latencyMs,
    };
  }
}
=== core/src/lib/extractors/index.ts ===
import { StreamtapeExtractor } from "./streamtape";
import { S3takuExtractor } from "./s3taku";
import type { BaseExtractor, ExtractorResult } from "./base";

const extractors: BaseExtractor[] = [
  new StreamtapeExtractor(),
  new S3takuExtractor(),
];

/**
 * Find an extractor that can handle the given embed URL.
 */
export function getExtractor(embedUrl: string): BaseExtractor | null {
  return extractors.find((e) => e.canHandle(embedUrl)) ?? null;
}

/**
 * Extract video source(s) from an embed URL.
 * Finds the right extractor automatically based on the URL's domain.
 * Returns null if no extractor matches or extraction fails.
 *
 * Never logs the full embed URL — only the hostname for debugging.
 */
export async function extractSource(
  embedUrl: string
): Promise<ExtractorResult | null> {
  const extractor = getExtractor(embedUrl);
  if (!extractor) {
    let hostname: string;
    try {
      hostname = new URL(embedUrl).hostname;
    } catch {
      hostname = "invalid-url";
    }
    console.error(`[extractor] No extractor found for: ${hostname}`);
    return null;
  }

  try {
    const result = await Promise.race([
      extractor.extract(embedUrl),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Extractor timeout after 10s")),
          10000
        )
      ),
    ]);
    return result;
  } catch (err) {
    // Log hostname only — NEVER log the full URL
    let hostname: string;
    try {
      hostname = new URL(embedUrl).hostname;
    } catch {
      hostname = "invalid-url";
    }
    console.error(
      `[extractor] Failed for ${hostname}:`,
      (err as Error).message
    );
    return null;
  }
}

export type { BaseExtractor, ExtractorResult };
=== core/src/lib/fetch.ts ===
/**
 * Smart fetch helper — tries native fetch first, falls back to Playwright
 * with stealth mode if Cloudflare or other bot-detection blocks us.
 *
 * This is the ONLY place Playwright is imported in the entire codebase.
 */

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Fetch a page's HTML. Attempts a lightweight native fetch first.
 * If Cloudflare/bot-detection is encountered, retries with a headless
 * Chromium browser via playwright-extra + stealth plugin.
 */
async function smartFetch(url: string, referer?: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });

    const html = await res.text();

    // Detect Cloudflare challenge page
    if (
      html.includes("cf-browser-verification") ||
      html.includes("Just a moment") ||
      html.includes("Checking your browser") ||
      res.status === 403
    ) {
      throw new Error("Cloudflare challenge detected");
    }

    return html;
  } catch {
    // Fall back to Playwright with stealth
    return playwrightFetch(url);
  }
}

/**
 * Headless Chromium fetch — only used as a fallback when native fetch
 * is blocked by Cloudflare or similar bot-detection.
 */
async function playwrightFetch(url: string): Promise<string> {
  const { chromium } = await import("playwright-extra");
  const StealthPlugin = (await import("playwright-extra-plugin-stealth"))
    .default;
  chromium.use(StealthPlugin());

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: DEFAULT_UA,
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

export { smartFetch, playwrightFetch };
=== core/src/index.ts ===
// Everything web/ needs from core is exported here
export { getRacedSources, providers } from "./providers/index";
export { checkRateLimit } from "./lib/rate-limit";
export type {
  EpisodeSource,
  VideoSource,
  Subtitle,
  BaseProvider,
  ProviderCheckResult,
} from "./providers/base";
TSSS:thesupersuperanime.lol thesupersupersigma$ 

Here are the two new web/ API files:
TSSS:thesupersuperanime.lol thesupersupersigma$ cat web/src/app/api/source/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getRacedSources, checkRateLimit } from "@/lib/core";

/**
 * POST /api/source
 *
 * Body: { animeTitle: string, episodeNum: number, animeId: number }
 * Auth: site-auth cookie (handled by middleware)
 * Rate limit: 10 requests per minute per session
 *
 * Returns: { sources: [{ token, quality, isM3U8 }] }
 * Raw URLs NEVER appear in the response.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Parse request ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { animeTitle, episodeNum, animeId } = body as {
      animeTitle?: string;
      episodeNum?: number;
      animeId?: number;
    };

    if (!animeTitle || episodeNum == null || animeId == null) {
      return NextResponse.json(
        { error: "Missing required fields: animeTitle, episodeNum, animeId" },
        { status: 400 }
      );
    }

    // ── Get session + IP ──────────────────────────────────────────────────────
    const sessionId =
      req.cookies.get("session-id")?.value ??
      req.cookies.get("site-auth")?.value ??
      "anonymous";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    // ── Rate limit ────────────────────────────────────────────────────────────
    if (!checkRateLimit(sessionId, 10, 60_000)) {
      return NextResponse.json(
        { error: "Rate limited — max 10 requests per minute" },
        { status: 429 }
      );
    }

    // ── Race all providers ────────────────────────────────────────────────────
    let episodeSources;
    try {
      episodeSources = await getRacedSources(animeTitle, episodeNum);
    } catch (err) {
      // AggregateError means all providers failed
      console.error(
        "[/api/source] All providers failed:",
        err instanceof Error ? err.message : "unknown"
      );
      return NextResponse.json(
        { error: "No sources available — all providers failed" },
        { status: 503 }
      );
    }

    // Log provider + latency only — NEVER log the actual URL
    console.log(
      `[/api/source] Provider: ${episodeSources.provider}, Latency: ${episodeSources.latencyMs}ms, Sources: ${episodeSources.sources.length}`
    );

    // ── Create signed tokens for each source ──────────────────────────────────
    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;

    if (!encryptionSecret || !tokenSecret) {
      console.error(
        "[/api/source] Missing ENCRYPTION_SECRET or TOKEN_SECRET env vars"
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 60_000); // 30 minutes

    const tokenizedSources = await Promise.all(
      episodeSources.sources.map(async (source) => {
        // Encrypt the raw URL with AES-256-CBC
        const iv = randomBytes(16);
        const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
        const cipher = createCipheriv("aes-256-cbc", key, iv);
        let encrypted = cipher.update(source.url, "utf8", "hex");
        encrypted += cipher.final("hex");
        const encryptedUrl = iv.toString("hex") + ":" + encrypted;

        // Generate a random token ID
        const tokenId = randomBytes(24).toString("hex");

        // Sign the token: HMAC-SHA256(tokenId + expiresAt, TOKEN_SECRET)
        const signature = createHmac("sha256", tokenSecret)
          .update(tokenId + expiresAt.toISOString())
          .digest("hex");

        const token = `${tokenId}.${signature}`;

        // Store in DB
        await db.sourceToken.create({
          data: {
            token,
            url: encryptedUrl,
            sessionId,
            ip,
            quality: source.quality,
            isM3U8: source.isM3U8,
            expiresAt,
          },
        });

        return {
          token,
          quality: source.quality,
          isM3U8: source.isM3U8,
        };
      })
    );

    return NextResponse.json({ sources: tokenizedSources });
  } catch (err) {
    console.error(
      "[/api/source] Unexpected error:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
TSSS:thesupersuperanime.lol thesupersupersigma$ cat web/src/app/api/proxy/\[token\]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createDecipheriv, createCipheriv, randomBytes, createHmac } from "crypto";
import { db } from "@/lib/db";

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/proxy/[token]
 *
 * No auth cookie required — the token IS the authorization.
 * The token is validated against the DB (existence, expiry, IP, session).
 *
 * For m3u8: fetches the playlist, rewrites chunk URLs to proxy through
 *           new short-lived tokens, and returns the rewritten playlist.
 * For mp4:  pipes the response stream directly, supporting Range headers.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  try {
    // ── Look up token in DB ─────────────────────────────────────────────────
    const record = await db.sourceToken.findUnique({ where: { token } });

    if (!record) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // ── Validate token ──────────────────────────────────────────────────────
    if (new Date() > record.expiresAt) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    // Check IP matches
    const requestIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    if (record.ip !== requestIp && record.ip !== "unknown") {
      return NextResponse.json({ error: "IP mismatch" }, { status: 403 });
    }

    // Check session matches (site-auth or session-id cookie)
    const sessionId =
      req.cookies.get("session-id")?.value ??
      req.cookies.get("site-auth")?.value ??
      "anonymous";
    if (record.sessionId !== sessionId && record.sessionId !== "anonymous") {
      return NextResponse.json(
        { error: "Session mismatch" },
        { status: 403 }
      );
    }

    // For mp4: check if already used
    if (!record.isM3U8 && record.used) {
      return NextResponse.json(
        { error: "Token already consumed" },
        { status: 410 }
      );
    }

    // ── Decrypt the stored URL ──────────────────────────────────────────────
    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const [ivHex, encryptedHex] = record.url.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decryptedUrl = decipher.update(encryptedHex, "hex", "utf8");
    decryptedUrl += decipher.final("utf8");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "*";

    // ── Handle m3u8 playlists ───────────────────────────────────────────────
    if (record.isM3U8) {
      const playlistRes = await fetch(decryptedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: decryptedUrl,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!playlistRes.ok) {
        return NextResponse.json(
          { error: "Failed to fetch playlist" },
          { status: 502 }
        );
      }

      let playlist = await playlistRes.text();

      // Rewrite .ts chunk URLs to go through /api/proxy/[new-token]
      // Each chunk gets its own short-lived token (5 minute expiry)
      const lines = playlist.split("\n");
      const rewrittenLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (
          !trimmed ||
          trimmed.startsWith("#") ||
          !trimmed.match(/\.(ts|m4s|mp4|key|m3u8)(\?|$)/i)
        ) {
          rewrittenLines.push(line);
          continue;
        }

        // Resolve the chunk URL relative to the playlist URL
        let chunkUrl: string;
        try {
          chunkUrl = new URL(trimmed, decryptedUrl).toString();
        } catch {
          chunkUrl = trimmed;
        }

        // Create a short-lived token for this chunk
        const chunkToken = await createChunkToken(
          chunkUrl,
          record.sessionId,
          record.ip,
          encryptionSecret
        );

        rewrittenLines.push(`/api/proxy/${chunkToken}`);
      }

      playlist = rewrittenLines.join("\n");

      return new NextResponse(playlist, {
        status: 200,
        headers: {
          "Content-Type": "application/x-mpegURL",
          "Access-Control-Allow-Origin": siteUrl,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // ── Handle mp4 / raw stream ─────────────────────────────────────────────
    // Mark token as used immediately
    await db.sourceToken.update({
      where: { token },
      data: { used: true },
    });

    // Build fetch headers — forward Range for seek support
    const fetchHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    const streamRes = await fetch(decryptedUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(30000),
    });

    if (!streamRes.ok && streamRes.status !== 206) {
      return NextResponse.json(
        { error: "Failed to fetch source" },
        { status: 502 }
      );
    }

    // Pipe the response stream
    const responseHeaders: Record<string, string> = {
      "Content-Type":
        streamRes.headers.get("content-type") ?? "video/mp4",
      "Access-Control-Allow-Origin": siteUrl,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    const contentLength = streamRes.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    const contentRange = streamRes.headers.get("content-range");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    const acceptRanges = streamRes.headers.get("accept-ranges");
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    return new NextResponse(streamRes.body, {
      status: streamRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(
      "[/api/proxy] Error:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Create a short-lived token for an m3u8 chunk URL.
 * Chunk tokens expire in 5 minutes (vs 30 for main source tokens).
 */
async function createChunkToken(
  chunkUrl: string,
  sessionId: string,
  ip: string,
  encryptionSecret: string
): Promise<string> {
  const tokenSecret = process.env.TOKEN_SECRET;
  if (!tokenSecret) throw new Error("TOKEN_SECRET not set");

  // Encrypt chunk URL
  const iv = randomBytes(16);
  const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(chunkUrl, "utf8", "hex");
  encrypted += cipher.final("hex");
  const encryptedUrl = iv.toString("hex") + ":" + encrypted;

  // Token ID + signature
  const tokenId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 minutes
  const signature = createHmac("sha256", tokenSecret)
    .update(tokenId + expiresAt.toISOString())
    .digest("hex");
  const token = `${tokenId}.${signature}`;

  // Store in DB — mp4=false since these are stream chunks, not full videos
  await db.sourceToken.create({
    data: {
      token,
      url: encryptedUrl,
      sessionId,
      ip,
      quality: "chunk",
      isM3U8: false,
      expiresAt,
      used: false,
    },
  });

  return token;
}
TSSS:thesupersuperanime.lol thesupersupersigma$ 

One known issue to verify:
The source route imports from "@/lib/core" but the spec says to use "@tsss/core". Check if web/src/lib/core.ts exists as a re-export shim. If it doesn't exist, flag it.

Please report:
1. Any imports that will cause build failures
2. Any logic bugs in the token signing, encryption, or proxy flow
3. Any missing files referenced by the code that don't exist
4. Any places where raw URLs could leak to the browser or logs
5. Anything that doesn't match the spec

Do not rewrite files. Just list the issues clearly so I can fix them one by one.

