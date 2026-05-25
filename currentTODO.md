Good session — password reset works, import works. Let me react to each idea and then we'll prioritize:

---

**Account page navigation — yes, easy win**
Needs a back-to-home button and proper tabs: Watch History, Watchlist, Import, Settings. The current page is just a dead end with two cards. This should be next.

**Bookmark button showing trending — agreed, confusing**
That should either be removed or repurposed. The natural replacement is a Watchlist shortcut since you already have that data model built.

**Watch history page — needed**
You have `WatchHistory` in the DB already, it's just not surfaced anywhere. This fits naturally as a tab on the account page.

**Next episode countdown — great idea, underrated feature**
AniList's API returns `nextAiringEpisode { airingAt, episode }` on every anime query — you're already calling AniList for metadata so this is basically free to add on the anime detail page and the watch page. Low effort, high impact.

**Comments — doable but needs a plan**
Simple approach: store comments in your Neon DB, tied to `animeId` + `userId`. Threaded replies later. The main question is moderation — with no moderation it'll get spammy fast. Worth doing but not urgent.

**Leaderboard/rankings — fun but complex**
"Most anime watched" requires aggregating WatchHistory. Totally doable. The interesting question is what you rank — episodes watched, shows completed, hours watched? Hours watched is the most impressive metric.

**Discord-required signup — I'd push back on this one**
Forcing Discord to "prevent legal problems" doesn't actually provide legal protection — if anything it creates a paper trail. What it does do is add friction that kills signups. The optional Discord link for perks (roles, server access, verified badge) is a much better UX. Make it valuable to link, not mandatory.

**Verified users — yes but differently**
Instead of Discord-gated accounts, do a verified badge for users who link Discord AND have been on the site for X days or watched Y episodes. Gives it meaning without blocking new users.

---

**Suggested priority order:**

1. Account page tabs (History, Watchlist, Import, Settings) + back button — it's broken UX right now - DONE
2. Next episode countdown on anime/watch pages — almost free with existing AniList data - DONE
3. Watchlist page surfaced properly, bookmark button fixed - DONE
4. Comments on anime pages - DONE
5. Leaderboard - DONE
6. Optional Discord linking (user HAS to link discord b4 using the sites) - DONE

Want to start with the account page overhaul? That's the most broken thing right now and unblocks showing history/watchlist which you already have data for.

ALSO ADD THE 3RD DEPLOYMENT FOR MUIRO API - DONE

Brainstorm for later:

Leaderboard + Discord avatars (everyone's linked now so this looks great)
Episode comments on the watch page would feel more natural than anime-level comments for a lot of shows
Notifications when a new episode airs for something in your watchlist (websocket or just polling)
Search filters (by genre, season, year, format) since the search page is currently just a plain text search

continue-watching.tsx



