"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AniWaveProvider = void 0;
const fetch_1 = require("../lib/fetch");
const index_1 = require("../lib/extractors/index");
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
class AniWaveProvider {
    id = "aniwave";
    displayName = "AniWave";
    async findEpisodeId(animeTitle, episodeNum) {
        // Step 1: Search for the anime
        const searchUrl = `${BASE_URL}/filter?keyword=${encodeURIComponent(animeTitle)}`;
        const searchHtml = await (0, fetch_1.smartFetch)(searchUrl);
        // Find anime links and their data-id attributes from search results
        // Pattern: <a href="/watch/naruto.abc123" ... data-id="12345">
        // or: <a href="/watch/naruto.abc123" ...>
        const animeLinks = [];
        // Try to extract links with data-id
        const linkRegex = /<a[^>]+href=["'](\/watch\/[^"']+)["'][^>]*?(?:data-id=["']([^"']+)["'])?[^>]*>[\s\S]*?<\/a>/gi;
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
        const bestMatch = animeLinks.find((a) => a.title.toLowerCase().includes(normalizedSearch)) ??
            animeLinks.find((a) => normalizedSearch.includes(a.title.toLowerCase())) ??
            animeLinks[0];
        // Step 2: Fetch the anime page to get the anime data-id
        let animeDataId = bestMatch.dataId;
        if (!animeDataId) {
            const animePage = await (0, fetch_1.smartFetch)(`${BASE_URL}${bestMatch.href}`);
            // Look for data-id on the anime page
            // Pattern: data-id="12345" or id="watch-main" data-id="12345"
            const dataIdMatch = animePage.match(/(?:id=["']watch-main["'][^>]*)?data-id=["'](\d+)["']/);
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
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Referer: `${BASE_URL}${bestMatch.href}`,
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!episodeListRes.ok) {
            return null;
        }
        const episodeListData = (await episodeListRes.json());
        const episodeListHtml = episodeListData.result ?? "";
        // Step 4: Find the episode matching episodeNum
        // Pattern: data-number="1" data-id="ep12345"
        //      or: data-num="1" data-id="ep12345"
        //      or: ep-num="1" ... data-id="12345"
        const episodeRegex = new RegExp(`data-(?:number|num|ep-num)=["']${episodeNum}["'][^>]*data-id=["']([^"']+)["']`, "i");
        const epMatch = episodeListHtml.match(episodeRegex);
        if (epMatch) {
            return epMatch[1];
        }
        // Try reversed attribute order: data-id before data-number
        const reversedRegex = new RegExp(`data-id=["']([^"']+)["'][^>]*data-(?:number|num|ep-num)=["']${episodeNum}["']`, "i");
        const reversedMatch = episodeListHtml.match(reversedRegex);
        return reversedMatch ? reversedMatch[1] : null;
    }
    async getSources(episodeId) {
        const start = Date.now();
        // Fetch sources via AJAX
        const sourcesUrl = `${BASE_URL}/ajax/episode/sources?id=${episodeId}`;
        const sourcesRes = await fetch(sourcesUrl, {
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Referer: BASE_URL,
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!sourcesRes.ok) {
            const latencyMs = Date.now() - start;
            return { sources: [], provider: this.id, latencyMs };
        }
        const sourcesData = (await sourcesRes.json());
        // Extract embed URLs from the response
        const embedUrls = [];
        if (sourcesData.result?.url) {
            let url = sourcesData.result.url;
            if (url.startsWith("//"))
                url = `https:${url}`;
            embedUrls.push(url);
        }
        if (sourcesData.result?.sources) {
            for (const s of sourcesData.result.sources) {
                let url = s.url;
                if (url.startsWith("//"))
                    url = `https:${url}`;
                embedUrls.push(url);
            }
        }
        if (embedUrls.length === 0) {
            const latencyMs = Date.now() - start;
            return { sources: [], provider: this.id, latencyMs };
        }
        // Try each embed URL with extractors
        for (const embedUrl of embedUrls) {
            const result = await (0, index_1.extractSource)(embedUrl);
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
    async check() {
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
                error: result.sources.length === 0
                    ? "No sources extracted from AJAX endpoint"
                    : undefined,
            };
        }
        catch (err) {
            return {
                success: false,
                latencyMs: Date.now() - start,
                error: err instanceof Error ? err.message : "Unknown error",
            };
        }
    }
}
exports.AniWaveProvider = AniWaveProvider;
//# sourceMappingURL=aniwave.js.map