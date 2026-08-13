import { NextRequest, NextResponse } from "next/server";

/**
 * Markdown-for-Agents endpoint.
 *
 * An agent that *explicitly* sends `Accept: text/markdown` for a page is routed
 * here by src/proxy.ts via an internal rewrite (`/foo` → `/api/md?path=/foo`),
 * so the URL the agent sees stays `/foo` but the body is markdown. Browsers
 * never send `text/markdown`, so they keep getting the normal HTML page.
 *
 * We serve curated markdown representations for the key pages and a graceful
 * fallback for everything else. The homepage overview mirrors public/llms.txt —
 * keep the two in sync.
 */

const SITE = "https://www.thesupersuperanime.lol";

const HOME = `# thesupersuperanime.lol

> A personal anime streaming site with a full episode library, community
> features, AniList sync, and a global leaderboard.

## What this site does
- Stream anime episodes with sub and dub support via HLS
- Track watch history and per-episode progress
- Episode-level comments and community discussion
- Watchlist management with AniList OAuth sync (import/export)
- Genre browsing with community voting on genre accuracy
- Global leaderboard ranked by minutes watched
- Sitewide + per-anime chat, watch parties, and public user profiles

## Key pages
- [/](${SITE}/) — Home feed: trending, seasonal, airing, upcoming
- [/search](${SITE}/search) — Search & filter by title, genre, format, status, season, year
- [/anime/{id}](${SITE}/anime) — Anime detail with paginated episode grid
- [/watch/{animeId}/{episodeNum}](${SITE}/watch) — Episode watch page
- [/genres](${SITE}/genres) — Browse by genre with community voting
- [/leaderboard](${SITE}/leaderboard) — Global watch-time leaderboard
- [/user/{username}](${SITE}/user) — Public user profiles
- [/status](${SITE}/status) — Service status & uptime
- [/updates](${SITE}/updates) — Changelog

## Machine-readable resources
- [/llms.txt](${SITE}/llms.txt) — this overview as plain text
- [/.well-known/api-catalog](${SITE}/.well-known/api-catalog) — API catalog (RFC 9727)
- [/.well-known/openapi.json](${SITE}/.well-known/openapi.json) — OpenAPI description of the public endpoints
- [/.well-known/mcp/server-card.json](${SITE}/.well-known/mcp/server-card.json) — MCP server card
- [/.well-known/agent-skills/index.json](${SITE}/.well-known/agent-skills/index.json) — agent skills
- [/sitemap.xml](${SITE}/sitemap.xml) — sitemap

## Legal
- [/privacy](${SITE}/privacy) — Privacy policy
- [/terms](${SITE}/terms) — Terms of service
`;

const PAGES: Record<string, string> = {
  "/": HOME,
  "/search": `# Search — thesupersuperanime.lol

Search and filter the anime library by title, genre, format, status, season, and year. Metadata comes from AniList.

- HTML: ${SITE}/search
- Agent skills: ${SITE}/.well-known/agent-skills/index.json
`,
  "/genres": `# Genres — thesupersuperanime.lol

Browse anime organized by genre, with community voting on genre accuracy.

- HTML: ${SITE}/genres
`,
  "/leaderboard": `# Leaderboard — thesupersuperanime.lol

Global leaderboard of the most active watchers, ranked by total minutes watched.

- HTML: ${SITE}/leaderboard
`,
  "/status": `# Status — thesupersuperanime.lol

Live service status and uptime for infrastructure and stream providers.

- HTML: ${SITE}/status
- JSON: ${SITE}/api/status
`,
  "/updates": `# Updates — thesupersuperanime.lol

Changelog of site updates.

- HTML: ${SITE}/updates
- JSON: ${SITE}/api/changelog
`,
  "/privacy": `# Privacy Policy — thesupersuperanime.lol

See the full privacy policy at ${SITE}/privacy.
`,
  "/terms": `# Terms of Service — thesupersuperanime.lol

See the full terms of service at ${SITE}/terms.
`,
};

function fallback(path: string): string {
  const safe = path.replace(/[\r\n]/g, "");
  return `# thesupersuperanime.lol

A dedicated markdown representation of \`${safe}\` isn't available. View the page in a browser at ${SITE}${safe}, or read the site overview at ${SITE}/llms.txt.

Machine-readable discovery:
- [/.well-known/api-catalog](${SITE}/.well-known/api-catalog)
- [/.well-known/openapi.json](${SITE}/.well-known/openapi.json)
`;
}

export function GET(req: NextRequest) {
  // Primary source is the x-md-path header set by the proxy rewrite; the query
  // param is a fallback for direct hits to /api/md?path=/foo.
  const path = req.headers.get("x-md-path") || req.nextUrl.searchParams.get("path") || "/";
  const body = PAGES[path] ?? fallback(path);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
