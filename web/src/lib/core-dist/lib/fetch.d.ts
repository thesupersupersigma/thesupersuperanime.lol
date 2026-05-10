/**
 * Smart fetch helper — tries native fetch first, falls back to Playwright
 * with stealth mode if Cloudflare or other bot-detection blocks us.
 *
 * This is the ONLY place Playwright is imported in the entire codebase.
 */
/**
 * Fetch a page's HTML. Attempts a lightweight native fetch first.
 * If Cloudflare/bot-detection is encountered, retries with a headless
 * Chromium browser via playwright-extra + stealth plugin.
 */
declare function smartFetch(url: string, referer?: string): Promise<string>;
/**
 * Headless Chromium fetch — only used as a fallback when native fetch
 * is blocked by Cloudflare or similar bot-detection.
 */
declare function playwrightFetch(url: string): Promise<string>;
export { smartFetch, playwrightFetch };
//# sourceMappingURL=fetch.d.ts.map