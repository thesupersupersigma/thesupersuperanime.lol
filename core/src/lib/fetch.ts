/**
 * Smart fetch helper — tries native fetch first, falls back to Playwright
 * with stealth mode if Cloudflare or other bot-detection blocks us.
 *
 * This is the ONLY place Playwright is imported in the entire codebase.
 */

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

declare const process: any;

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
  const { chromium } = await import('playwright-extra')
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default
  chromium.use(StealthPlugin())

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? undefined, //executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
    ]
  })

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'en-US',
    })
    const page = await context.newPage()
    // Block images, fonts, and stylesheets to speed up page load
    await page.route('**/*', route => {
      const type = route.request().resourceType()
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        route.abort()
      } else {
        route.continue()
      }
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    // Wait specifically for an iframe to appear
    await page.waitForSelector('iframe', { timeout: 15000 }).catch(() => {})
    return await page.content()
  } finally {
    await browser.close()
  }
}

export { smartFetch, playwrightFetch };
