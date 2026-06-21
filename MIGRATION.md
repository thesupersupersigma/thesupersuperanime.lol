# MIGRATION.md — thesupersuperanime.lol

> Last updated: June 21, 2026. Documents the migration from Anivexa + Vercel to RECONSUMET-TS + Oracle VM (Coolify).

---

## What changed and why

### Scraper: Anivexa → RECONSUMET-TS

**Before:** The site used [walterwhite-69/Anivexa-API](https://github.com/walterwhite-69/Anivexa-API), a third-party scraper running on the Oracle VM via PM2 on port 4000. It was pointed to by `ANIVEXA_API_URL`.

**After:** The site now uses [RECONSUMET.TS](https://github.com/thesupersupersigma/RECONSUMET.TS), a custom 2025 fork of consumet/extensions. It runs on the Oracle VM via Coolify (Docker) and is publicly accessible at `https://api.thesupersuperanime.lol`.

**Why:**
- Anivexa had a multi-season bug — Love is War S1 and S2 mapped to the same AniList ID, so watching S2 would play S1 streams
- RECONSUMET-TS has a two-tier season disambiguation system (title similarity + AniList metadata verification) that solves this correctly
- Better output: returns quality variants (360p/720p/1080p), soft English subtitles, intro/outro markers, and sub+dub in a single `/watch` call
- No proxy layer in the API — returns raw URLs + required headers for the site's own token proxy to handle

### Hosting: Vercel (frontend only) → Coolify on Oracle VM

**Before:** Next.js site on Vercel free tier. Vercel was being rejected by theindex.moe ("no free hosting").

**After:** Next.js site will be deployed via Coolify on the Oracle Cloud VM (`64.181.222.197`), with auto-deploy on every GitHub push to `master` — same workflow as Vercel. *(In progress — site still on Vercel during transition.)*

**Why:**
- theindex.moe submission requirements reject free hosting (Vercel, Netlify, etc.)
- Oracle Cloud always-free ARM VM (4 OCPU, 24GB RAM) is effectively free and self-hosted
- Coolify handles SSL (Let's Encrypt), reverse proxy (Traefik), and GitHub webhook auto-deploys

---

## Current VM layout

| Service | How it runs | Port | Public URL |
|---|---|---|---|
| RECONSUMET-TS API | Coolify (Docker) | 4001 internal | `https://api.thesupersuperanime.lol` |
| tsss-proxy | PM2 (`~/tsss-proxy`) | 8001 internal | `https://nginx.thesupersuperanime.lol:8443` |
| nginx | systemd | 8443 public | serves tsss-proxy over HTTPS |
| Coolify dashboard | Docker | 8000 | `http://64.181.222.197:8000` |
| Traefik (Coolify proxy) | Docker | 80, 443 | handles all Coolify app routing |

**Removed from VM:**
- Anivexa (was PM2, port 4000) — deleted
- Vantage (was Docker, ports 80/443) — deleted

---

## API contract change

### Old (Anivexa)
```
GET /episodes/:anilistId
→ { anikoto: { episodes: { sub: [...], dub: [...] } }, anineko: { ... } }

GET /:episodeId
→ { streams: [...], subtitles: [...] }
```

### New (RECONSUMET-TS)
```
GET /episodes/:anilistId
→ { provider: "AniNeko", providerId: "slug", episodes: [{ id, number, title }] }

GET /watch?provider=AniNeko&episodeId=slug/ep-1
→ {
    sub: { sources: [{ url, quality, isM3U8 }], subtitles: [{ url, lang }], headers: { Referer } },
    dub: { ... } | null
  }
```

The `source/route.ts` was updated to: call `/episodes/:anilistId` → find the matching episode → call `/watch` → normalize into `NormalizedStream[]` → run through the existing token encryption + DB storage pipeline unchanged.

---

## Env var changes

| Variable | Status | Notes |
|---|---|---|
| `SCRAPER_API_URL` | ✅ New (active) | `https://api.thesupersuperanime.lol` |
| `ANIVEXA_API_URL` | 🗄️ Legacy | Kept in `.env.example` for reference, no longer read by source/route.ts |
| `PROXY_VM_URL` | ✅ Unchanged | `https://nginx.thesupersuperanime.lol:8443` — tsss-proxy still active |

---

## RECONSUMET-TS providers (as of June 2026)

| Provider | Browser-free? | Subs | Status |
|---|---|---|---|
| AniNeko | ✅ Yes | Soft EN `.vtt` (simulcasts) | ✅ Working |
| AnimeNoSub | ✅ Yes | Soft EN `.vtt` (back-catalog via megaplay) | ✅ Working |
| AnikotoTV | ✅ Yes | Soft EN `.vtt` (megaplay) | ✅ Working |
| ReAnime | ✅ Yes | Soft `.ass` (fansub quality) | ✅ Working |
| Gogoanime | ❌ Needs cloakbrowser | Soft EN `.vtt` | ⚠️ Fallback only |
| AnimeUnity | ✅ Yes | Italian (no EN subs) | ⚠️ Fallback only |

---

## theindex.moe submission checklist

For future submission to [theindex.moe](https://theindex.moe):

- [x] Not on free hosting (Vercel rejected — migrating to Oracle VM)
- [x] Custom domain (`thesupersuperanime.lol`)
- [x] No malicious ads
- [x] No anti-adblock (ads gated behind `NEXT_PUBLIC_ADS_ENABLED`)
- [x] Has content (full AniList catalog)
- [x] Original branding (not 9anime/KissAnime clone)
- [ ] Not in development/beta — submit once VM migration is stable for 1-2 weeks
- [x] Not demanding payment

**Form answers (draft):**
```
Name: thesupersuperanime
URLs: thesupersuperanime.lol
---
Type: scraper
Scrapers: anineko.to, animenosub.to, anikototv.to, reanime.to
---
Resolutions: 360p, 720p, 1080p
---
Site Language: English
Subs: y, English
Dubs: y, English
Sub Types: soft
---
Ads: n
Adjustable Player Speed: y
Comments: y
Downloads: n
List Sync: AL (AniList)
Picture-in-Picture: y
Schedule: n
Watermark: n
---
Are you staff on the site being submitted: y
How long has the site been in development/released for: ~8 months
```

---

## What's still pending

- [ ] Move Next.js site from Vercel to Coolify on the VM (add as a second Coolify app)
- [ ] Update DNS for `thesupersuperanime.lol` to point to VM IP instead of Vercel
- [ ] Update `PROXY_VM_URL` — once site is on VM, tsss-proxy can be accessed internally (`http://localhost:8001`) instead of over public HTTPS
- [ ] Fix fullscreen bug on the watch page
- [ ] Test season disambiguation with Love is War S1/S2, Re:Zero S1/S2/S3/S4
- [ ] Submit to theindex.moe after 1-2 weeks of stable VM uptime
