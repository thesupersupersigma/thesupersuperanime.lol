<!-- tree -I 'node_modules|.git|.next|graphify-out|useless files:brokenstuff:unfixed stuff' > tree.txt -->
# thesupersuperanime.lol

A full-featured anime streaming site built solo — AniList metadata, custom HLS proxy, leaderboards, badges, watch parties, sitewide chat, and more.

**[thesupersuperanime.lol](https://thesupersuperanime.lol)** · **[Status](https://thesupersuperanime.lol/status)** · **[Updates](https://thesupersuperanime.lol/updates)**

---

## Features

**Streaming**
- HLS playback via Vidstack + hls.js with encrypted proxy tokens
- Sub/dub toggle, multi-server fallback, skip intro/outro (AniSkip)
- Resume from last position across devices
- Watch parties — SSE-synced rooms, shareable links, Discord slash commands

**Discovery**
- AniList-powered search with genre, season, format filters
- Genre pages with community voting (Overall Score vs Community Score tabs)
- Random anime route weighted by your genre preferences
- Trending, seasonal, airing soon, and upcoming rows on the homepage

**Community**
- Sitewide chat (Discord-clone layout with channels, online presence, admin moderation)
- Per-anime and per-episode comments with spoiler tags, likes, and replies
- Friends' activity feed, follow/follower system
- Leaderboard with daily/weekly/monthly/all-time tabs and a season system
- 39+ badges across watch milestones, streaks, leaderboard placement, community activity, and genre completion

**Profile**
- Watch history heatmap (GitHub-style, last 365 days)
- Stats: episodes watched, hours watched, shows completed, favorite genre
- Watchlist with AniList bidirectional sync
- Watch history CSV export
- Badge showcase with rarity ordering

**Notifications**
- Duolingo-style nudge emails: streak at risk, leaderboard rank change, new episode dropped, completion milestone
- Discord DMs on badge earn (notable milestones)
- New episode and badge announcement Discord channel posts

**Admin**
- Provider health dashboard with per-provider testing and Discord failure alerts
- Issue tracker with GitHub sync and Bug Hunter badge granting
- Announcement system (SSE banner, fullscreen-aware)
- Badge management panel (grant/revoke any badge to any user)
- Watch party room management
- Changelog panel with Discord post on publish

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS v4 |
| Database | Neon PostgreSQL via Prisma ORM |
| Auth | Discord OAuth + email/password (scrypt) |
| Video | Vidstack + hls.js, custom AES-256-CBC encrypted HLS proxy |
| Stream source | Anivexa API (self-hosted, Oracle Cloud VM) |
| VM proxy | tsss-proxy (Node.js, nginx + Let's Encrypt, Oracle Cloud) |
| Email | Resend |
| Deployment | Vercel (frontend), Oracle Cloud (VM), GitHub Actions (crons) |
| Real-time | SSE (announcements, watch parties, chat, status) |

---

## Repo Structure

```
thesupersuperanime.lol/
├── web/                  # Next.js app (see web/README.md for full setup guide)
│   ├── src/
│   │   ├── app/          # App Router pages and API routes
│   │   ├── components/   # Shared React components
│   │   ├── lib/          # Auth, AniList, Resend, Discord, badge engine, etc.
│   │   ├── providers/    # Provider health check adapters
│   │   └── prisma/       # Prisma schema
│   └── ...
├── .github/workflows/    # GitHub Actions (AniList sync, health check, streak emails, status check)
└── scripts/              # One-time setup scripts (Discord command registration)
```

→ **[Full developer setup guide in web/README.md](./web/README.md)**

---

## Related Repos

- [thesupersupersigma/TSSS-Proxy-thesupersuperanime.lol](https://github.com/thesupersupersigma/TSSS-Proxy-thesupersuperanime.lol) — Oracle VM HLS segment proxy