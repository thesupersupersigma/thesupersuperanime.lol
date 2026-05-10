"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VibePlayerExtractor = void 0;
class VibePlayerExtractor {
    domains = ['vibeplayer.site'];
    canHandle(url) {
        return this.domains.some((d) => url.includes(d));
    }
    async extract(embedUrl) {
        const start = Date.now();
        const urlObj = new URL(embedUrl);
        // e.g. /12bf5e593fa08b10
        const videoId = urlObj.pathname.split('/').filter(Boolean).pop();
        if (!videoId) {
            throw new Error("VibePlayer: No videoId found in URL");
        }
        const masterUrl = `https://vibeplayer.site/public/stream/${videoId}/master.m3u8`;
        const res = await fetch(masterUrl, {
            headers: {
                Referer: `https://vibeplayer.site/${videoId}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });
        if (!res.ok) {
            throw new Error(`VibePlayer: Failed to fetch master playlist (${res.status})`);
        }
        const playlist = await res.text();
        const lines = playlist.split('\n');
        const sources = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const nameMatch = line.match(/NAME="([^"]+)"/);
                const quality = nameMatch ? nameMatch[1] : "unknown";
                let fileLine = "";
                for (let j = i + 1; j < lines.length; j++) {
                    const l = lines[j].trim();
                    if (l && !l.startsWith('#')) {
                        fileLine = l;
                        break;
                    }
                }
                if (fileLine) {
                    sources.push({
                        url: `https://vibeplayer.site/public/stream/${videoId}/${fileLine}`,
                        quality,
                        isM3U8: true,
                        subtitles: [],
                    });
                }
            }
        }
        if (sources.length === 0) {
            throw new Error("VibePlayer: No streams found in master playlist");
        }
        return { sources, subtitles: [], latencyMs: Date.now() - start };
    }
}
exports.VibePlayerExtractor = VibePlayerExtractor;
//# sourceMappingURL=vibeplayer.js.map