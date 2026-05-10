import type { BaseExtractor, ExtractorResult } from './base';
import type { VideoSource } from '../../providers/base';

export class VibePlayerExtractor implements BaseExtractor {
  domains = ['vibeplayer.site'];

  canHandle(url: string): boolean {
    return this.domains.some((d) => url.includes(d));
  }

  async extract(embedUrl: string): Promise<ExtractorResult> {
    const start = Date.now()
    const videoId = embedUrl.split('/').pop()
    if (!videoId) throw new Error('Could not extract video ID')

    // Use Playwright to visit the embed page and capture cookies
    const { chromium } = await import('playwright-extra')
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default
    chromium.use(StealthPlugin())

    const browser = await chromium.launch({
      headless: true,
      // @ts-ignore
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
             '--disable-gpu', '--no-zygote', '--single-process']
    })

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      })
      const page = await context.newPage()

      // Visit embed page to get session cookies
      await page.goto(`https://vibeplayer.site/${videoId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      })

      // Wait for video to initialize
      await page.waitForTimeout(2000)

      // Get all cookies from this session
      const cookies = await context.cookies()
      const cookieHeader = cookies
        .map(c => `${c.name}=${c.value}`)
        .join('; ')

      // Now fetch master playlist with session cookies
      const masterUrl = `https://vibeplayer.site/public/stream/${videoId}/master.m3u8`
      const masterRes = await fetch(masterUrl, {
        headers: {
          'Referer': `https://vibeplayer.site/${videoId}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookieHeader,
        },
        signal: AbortSignal.timeout(8000)
      })

      if (!masterRes.ok) throw new Error(`master.m3u8 returned ${masterRes.status}`)

      const masterText = await masterRes.text()

      // Parse quality variants from master playlist
      const sources: VideoSource[] = []
      const lines = masterText.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          const nameMatch = line.match(/NAME="([^"]+)"/)
          const quality = nameMatch?.[1] ?? 'auto'
          const filename = lines[i + 1]?.trim()
          if (filename && !filename.startsWith('#')) {
            sources.push({
              url: `https://vibeplayer.site/public/stream/${videoId}/${filename}`,
              quality,
              isM3U8: true,
              subtitles: [],
              cookies: cookieHeader
            })
          }
        }
      }

      if (sources.length === 0) throw new Error('No quality variants found in master playlist')

      return { sources, subtitles: [], latencyMs: Date.now() - start }
    } finally {
      await browser.close()
    }
  }
}
