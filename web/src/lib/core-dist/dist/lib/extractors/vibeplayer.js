"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VibePlayerExtractor = void 0;
class VibePlayerExtractor {
    domains = ['vibeplayer.site'];
    canHandle(url) {
        return this.domains.some((d) => url.includes(d));
    }
    async extract(embedUrl) {
        const start = Date.now();
        const videoId = embedUrl.split('/').pop();
        if (!videoId)
            throw new Error('Could not extract video ID');
        // Use Playwright to visit the embed page and capture cookies
        const { chromium } = await Promise.resolve().then(() => __importStar(require('playwright-extra')));
        const StealthPlugin = (await Promise.resolve().then(() => __importStar(require('puppeteer-extra-plugin-stealth')))).default;
        chromium.use(StealthPlugin());
        const browser = await chromium.launch({
            headless: true,
            // @ts-ignore
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-gpu', '--no-zygote', '--single-process']
        });
        try {
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            });
            const page = await context.newPage();
            // Visit embed page to get session cookies
            await page.goto(`https://vibeplayer.site/${videoId}`, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            // Wait for video to initialize
            await page.waitForTimeout(2000);
            // Get all cookies from this session
            const cookies = await context.cookies();
            const cookieHeader = cookies
                .map(c => `${c.name}=${c.value}`)
                .join('; ');
            // Now fetch master playlist with session cookies
            const masterUrl = `https://vibeplayer.site/public/stream/${videoId}/master.m3u8`;
            const masterRes = await fetch(masterUrl, {
                headers: {
                    'Referer': `https://vibeplayer.site/${videoId}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Cookie': cookieHeader,
                },
                signal: AbortSignal.timeout(8000)
            });
            if (!masterRes.ok)
                throw new Error(`master.m3u8 returned ${masterRes.status}`);
            const masterText = await masterRes.text();
            // Parse quality variants from master playlist
            const sources = [];
            const lines = masterText.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#EXT-X-STREAM-INF')) {
                    const nameMatch = line.match(/NAME="([^"]+)"/);
                    const quality = nameMatch?.[1] ?? 'auto';
                    const filename = lines[i + 1]?.trim();
                    if (filename && !filename.startsWith('#')) {
                        sources.push({
                            url: `https://vibeplayer.site/public/stream/${videoId}/${filename}`,
                            quality,
                            isM3U8: true,
                            subtitles: [],
                            cookies: cookieHeader
                        });
                    }
                }
            }
            if (sources.length === 0)
                throw new Error('No quality variants found in master playlist');
            return { sources, subtitles: [], latencyMs: Date.now() - start };
        }
        finally {
            await browser.close();
        }
    }
}
exports.VibePlayerExtractor = VibePlayerExtractor;
//# sourceMappingURL=vibeplayer.js.map