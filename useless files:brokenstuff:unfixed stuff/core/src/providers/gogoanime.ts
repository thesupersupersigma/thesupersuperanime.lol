import { smartFetch, playwrightFetch } from "../lib/fetch";
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
      /<a\s+href=["'](\/category\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const matches: Array<{ href: string; title: string }> = [];

    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const innerHtml = linkMatch[0]; // the full anchor tag
      
      const titleMatch = innerHtml.match(/title=["']([^"']+)["']/i);
      if (titleMatch) {
        matches.push({ href, title: titleMatch[1] });
      } else {
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

    // Find the closest title match
    const normalizedSearch = animeTitle.toLowerCase().trim();
    
    const sortedMatches = [...matches].sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      
      if (aTitle === normalizedSearch) return -1;
      if (bTitle === normalizedSearch) return 1;
      
      const aIncludes = aTitle.includes(normalizedSearch);
      const bIncludes = bTitle.includes(normalizedSearch);
      
      if (aIncludes && !bIncludes) return -1;
      if (!aIncludes && bIncludes) return 1;
      
      return aTitle.length - bTitle.length;
    });

    const bestMatch = sortedMatches[0];

    // Extract the anime slug from the category href
    // /category/naruto → naruto
    const slug = bestMatch.href.replace("/category/", "");

    // Construct episode URL path: /{slug}-episode-{num}
    return `/${slug}-episode-${episodeNum}`;
  }

  async getSources(episodeId: string): Promise<EpisodeSource> {
    const start = Date.now();
    const episodeUrl = `${BASE_URL}${episodeId}`;
    const html = await playwrightFetch(episodeUrl);

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
