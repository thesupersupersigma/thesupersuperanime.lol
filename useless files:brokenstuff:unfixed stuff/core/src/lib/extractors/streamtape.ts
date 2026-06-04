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
