"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtractor = getExtractor;
exports.extractSource = extractSource;
const vibeplayer_1 = require("./vibeplayer");
const streamtape_1 = require("./streamtape");
const s3taku_1 = require("./s3taku");
const extractors = [
    new vibeplayer_1.VibePlayerExtractor(),
    new streamtape_1.StreamtapeExtractor(),
    new s3taku_1.S3takuExtractor(),
];
/**
 * Find an extractor that can handle the given embed URL.
 */
function getExtractor(embedUrl) {
    return extractors.find((e) => e.canHandle(embedUrl)) ?? null;
}
/**
 * Extract video source(s) from an embed URL.
 * Finds the right extractor automatically based on the URL's domain.
 * Returns null if no extractor matches or extraction fails.
 *
 * Never logs the full embed URL — only the hostname for debugging.
 */
async function extractSource(embedUrl) {
    const extractor = getExtractor(embedUrl);
    if (!extractor) {
        let hostname;
        try {
            hostname = new URL(embedUrl).hostname;
        }
        catch {
            hostname = "invalid-url";
        }
        console.error(`[extractor] No extractor found for: ${hostname}`);
        return null;
    }
    try {
        const result = await Promise.race([
            extractor.extract(embedUrl),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Extractor timeout after 10s")), 10000)),
        ]);
        return result;
    }
    catch (err) {
        // Log hostname only — NEVER log the full URL
        let hostname;
        try {
            hostname = new URL(embedUrl).hostname;
        }
        catch {
            hostname = "invalid-url";
        }
        console.error(`[extractor] Failed for ${hostname}:`, err.message);
        return null;
    }
}
//# sourceMappingURL=index.js.map