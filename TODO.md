# thesupersuperanime.lol — TODO

> Organized by priority. Items within each section are roughly ordered by impact.

---

## 🔴 High Priority (Do Next)

### Leaderboard Expansion
- [x] **Multiple timeframes** — Daily / Weekly / Monthly / All-time tabs on the leaderboard page
- [x] **Weekly leaderboard reset** — resets every Monday 00:00 UTC, stored separately in DB
- [x] **Season system** — monthly or quarterly seasons with a season number; past seasons archived on a `/leaderboard/seasons` page
- [x] **Discord bot leaderboard posts** — already posts all-time every 12h; add separate weekly/daily posts to Discord

### Badge System (Core)
- [x] **Badge model in DB** — `Badge` table with `id`, `slug`, `name`, `description`, `icon`, `rarity` (common/rare/epic/legendary), `grantedBy` (auto/admin/owner)
- [x] **UserBadge join table** — `userId`, `badgeSlug`, `grantedAt`, `grantedBy`
- [x] **Badge display on profiles** — shelf on `/user/[username]` showing earned badges, most prestigious first
- [x] **In-site toast notification** when a badge is earned
- [x] **Optional Discord DM** via bot when a badge is earned

### Badge Definitions — Watch Milestones (auto-granted)
- [x] First episode watched — "First Step"
- [x] 10 episodes — "Getting Started"
- [x] 50 episodes — "Committed"
- [x] 100 episodes — "Century Club"
- [x] 500 episodes — "Dedicated"
- [x] 1000 episodes — "Legendary Viewer"
- [x] 1h watch time
- [x] 10h watch time
- [x] 50h watch time
- [x] 100h watch time — "100 Hour Club"
- [x] 500h watch time
- [x] Completed 1 anime — "Finisher"
- [x] Completed 10 anime
- [x] Completed 50 anime — "Completionist"

### Badge Definitions — Airing Watcher (auto-granted, stackable tiers)
- [x] Watched 1 anime while it was airing — "OG Viewer"
- [x] Watched 5 anime while airing — "Seasonal Watcher"
- [x] Watched 10 anime while airing — "Airing Addict"
- [x] Watched 25 anime while airing — "Simulcast Legend"

### Badge Definitions — Leaderboard (auto-granted, stackable except #1 all-time)
- [x] Reached top 10 all-time — stackable
- [x] Reached top 3 all-time — stackable
- [x] Reached #1 all-time — NOT stackable, only ever granted once
- [x] Weekly champion (held #1 for a full week) — stackable, one per season won
- [x] Season champion — one per season won

### Badge Definitions — Community (auto-granted)
- [x] First comment posted
- [x] 10 comments posted
- [x] 50 comments posted
- [x] Received 10 likes on comments
- [x] Voted on 10+ genres — "Critic"
- [x] Linked Discord account — "Verified" (auto-granted on Discord OAuth link)
- [x] Account created before site launch date (OG member) — "OG" / "Beta Tester"
- [x] Referred a user who signed up — "Recruiter"

### Badge Definitions — Genre (auto-granted)
- [x] Watched 10+ completed anime in the same genre → e.g. "Romance Enjoyer", "Shonen Addict", "Isekai Survivor" etc. (one badge per genre)

### Badge Definitions — Streak (auto-granted)
- [x] 7-day watch streak — "Week Warrior"
- [x] 30-day watch streak — "Monthly Regular"
- [x] 100-day watch streak — "Unstoppable"

### Badge Definitions — Admin/Special (manually grantable)
- [x] 👑 **Owner** — tied to `ADMIN_USERS` env var; only the owner account; not grantable by anyone
- [x] 🛡️ **Admin** — tied to `ADMIN_USERS` env var; all admins automatically receive it
- [x] 🎖️ **Contributor** — grantable by admin (for people who helped the site)
- [x] 🐛 **Bug Hunter** — grantable by admin (reported a bug that got fixed)
- [x] 🎨 **Artist** — grantable by admin (community artists)
- [x] 💎 **Supporter** — grantable by admin (future donor/premium tier)
- [x] **Admin badge management panel** — UI for admins to search a user and grant/revoke any manually-grantable badge; owner can grant all badge types including admin-only ones

### Streak Emails (Duolingo-style nudges via Resend)
- [x] "Your streak is at risk 🔥" — if user hasn't watched today and had a streak yesterday
- [x] "Someone just passed you on the leaderboard" — triggered when rank changes
- [x] "A new episode of [anime] just dropped" — triggered when a new episode airs for something on the user's watchlist
- [x] "You're X episodes away from completing [anime]" — milestone nudge
- [x] All streak/notification emails opt-out-able in account settings

---

## 🟡 Medium Priority

### Profile System Expansion
- [x] **Watch stats block** on profile — total time, episodes watched, completed anime count, favorite genre
- [x] **Activity/contribution graph** — GitHub-style heatmap of watch history by day (open source: fork `Platane/snk` and adapt for watch history instead of commits)
- [x] **"Currently watching" section** on profile — pulled from watchlist
- [x] **Follow/follower system** — follow other users; see follower/following counts on profile
- [x] **Friends' activity feed** — `/feed` page showing recent watches from people you follow
- [x] **Watch history export** — download as CSV, or sync to MyAnimeList via MAL API

### Genre Voting Overhaul
- [x] **Split genre scoring into two tabs**:
  - "Community Score" tab — pure on-site votes only, no external weighting
  - "Overall Score" tab — current formula (AniList score × weight + site votes)
- [x] Show vote counts and breakdown on each tab

### Leaderboard Issues Tracking
- [x] **Issues/suggestions badges** — admin can grant "Bug Hunter" when a reported issue gets resolved
- [x] Link resolved issues to the user who reported them on their profile

### Discord Bot Expansion
- [x] **New episode notifications** to a `#new-episodes` Discord channel (requires knowing airing schedule — already have AniSkip/AniList data)
- [x] **Badge earned announcements** — optional channel for milestone achievements (e.g. "User X just hit 100h!")
- [x] **Watch party coordination** via bot commands

### Watch Parties
- [x] Synchronized watching — users in a "room" see the same timestamp
- [x] Room created from the watch page, shareable link
- [x] Discord bot integration — create a watch party from Discord, get a join link

### Animations & Polish
- [ ] Page transition animations (fade/slide between routes)
- [ ] Card hover effects (subtle scale/glow on anime cards)
- [ ] Confetti or particle effect when earning a badge
- [ ] Skeleton loading states (already partially done — extend to more pages)
- [ ] Smooth scroll behavior sitewide

### Random Anime
- [ ] `/random` route — redirects to a random anime from AniList filtered by user's genre preferences if logged in, otherwise truly random
- [ ] "Random" button in nav or on homepage

### Sitewide Chat
- [ ] Global chat accessible from a floating button or dedicated `/chat` page
- [ ] Per-anime chat room on the anime detail page
- [ ] Moderation tools for admins (delete message, timeout user)

### Community Promotion Banner (Miruro-style)
- [ ] Dismissible banner on homepage/watch page encouraging users to share the site and join Discord
- [ ] Different copy variants to avoid feeling stale
- [ ] Tracks dismissal in localStorage so it doesn't reappear immediately

### Changelog / Updates Page
- [ ] `/updates` page showing recent site changes (manually maintained markdown or DB-driven)
- [ ] Optional "what's new" modal on first visit after a major update (dismissible, stored in localStorage)
- [ ] Discord bot posts changelog entries to `#updates` channel automatically

### AI Assistant
- [ ] Self-hosted Ollama on Oracle VM with a small model (Mistral 7B or Llama 3.2 3B)
- [ ] "Ask about this anime" button on anime detail pages
- [ ] General recommendation assistant — "I liked X, what should I watch?"
- [ ] Keep it optional/togglable; fallback gracefully if VM is under load

---

## 🟢 Lower Priority (Future)

### PWA (Progressive Web App)
- [ ] Add `manifest.json` with icons, theme color, display mode
- [ ] Service worker for offline support / install prompt
- [ ] Already works well on mobile — PWA just makes it installable

### Newsletter
- [ ] Weekly email digest — new episodes for anime on your watchlist, top leaderboard changes
- [ ] Opt-in only, managed in account settings
- [ ] Powered by Resend (already configured)

### Watch History Contribution Snake
- [ ] Fork `Platane/snk` GitHub Action
- [ ] Generate a snake animation over the user's watch history heatmap
- [ ] Users can embed it on their GitHub profile README or display it on their site profile

### Referral System
- [ ] Each user gets a unique referral link
- [ ] Both referrer and referee get a badge when signup completes
- [ ] Track referral counts on profile

### Community Challenges
- [ ] Admin posts weekly challenge ("Watch 3 romance anime this week")
- [ ] Users who complete it get a limited badge
- [ ] Challenge history page

### Anime Club
- [ ] Admin picks a monthly "community anime"
- [ ] Dedicated discussion thread, watch-along schedule
- [ ] Completion badge for participants

### Status Page
- [ ] `/status` showing uptime for Anivexa API, Vercel, DB
- [ ] Auto-updated by a cron on the VM pinging each service

### Manga
- [ ] Add manga reading support alongside anime streaming
- [ ] Manga detail pages at `/manga/[id]` (sourced from AniList manga entries)
- [ ] Chapter reader with page-by-page and long-strip (webtoon) modes
- [ ] Manga source scraper/API (separate from Anivexa — needs its own provider e.g. MangaDex API)
- [ ] Manga watchlist/readlist — track chapters read, mark as reading/completed/plan to read
- [ ] Manga leaderboard — chapters read, pages read
- [ ] Manga badges — first chapter, 100 chapters, completed a manga, etc.
- [ ] Search includes manga results with a toggle (anime vs manga vs both)
- [ ] AniList sync extended to manga read progress

### Easter Eggs
- [ ] **Konami Code** (↑ ↑ ↓ ↓ ← → ← → B A) — some kind of visual reward (confetti, secret page, etc.)
- [ ] **IDDQD** (Doom god mode cheat) — maybe toggle an invincible/god mode UI theme
- [ ] **IDKFA** (Doom all weapons cheat) — unlock all badge slots displayed on profile temporarily
- [ ] **A, B, A, C, A, B, B** — mystery (Mortal Kombat blood code on Sega Genesis)

### Site as a Template (long-term)
- [ ] Once the site gets significant traction, package it as a deployable template
- [ ] Configurable providers, branding, DB
- [ ] Sell or open-source it

---

## 🔧 Infrastructure / Technical Debt

- [ ] **Fix Anivexa periodic crashes** — pahe/animegg/anidbapp providers throwing unhandled errors and crashing the process; wrap provider calls in try/catch per-provider so one bad provider can't kill the whole process
- [ ] **Re-enable HilltopAds + AdSense** behind `NEXT_PUBLIC_ADS_ENABLED=true` when ready (AdSense needs 10-day wait)
- [ ] **Fix `llms.txt`** — verify it's accurate after all recent changes
- [ ] **Anivexa public API** — cluster mode + rate limiting for when it's ready to go public
- [ ] **Push to GitHub every session** ← recurring reminder

---

## ✅ Recently Completed

- nginx + Let's Encrypt on Oracle VM → tsss-proxy now serves over HTTPS
- VM proxy CORS fix — segments load correctly from `nginx.thesupersuperanime.lol:8443`
- Watch page redesign — Miruro-style episode sidebar with thumbnails, titles, air dates
- Dynamic OG image route (`/api/og`) for anime and watch pages
- Watch page server wrapper — `generateMetadata` now works on the watch page
- JSON-LD structured data on anime and watch pages
- Internal contextual links — genre tags → `/genres/[genre]`, watch title → `/anime/[id]`
- Sitemap `lastModified` added
- Discord leaderboard bot — posts top 10 to `#leaderboard` every 12h via cron
- AniList OAuth sync (bidirectional, 6h GitHub Actions cron)
- Skip intro/outro (AniSkip API)
- Admin announcement system
- Episode deduplication (one provider per audio type)
- HilltopAds gated behind `NEXT_PUBLIC_ADS_ENABLED` feature flag