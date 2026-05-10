"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3takuExtractor = void 0;
const crypto_js_1 = __importDefault(require("crypto-js"));
/**
 * S3taku / Embtaku Extractor
 *
 * S3taku (GogoAnime's primary video host, also operates as embtaku.pro)
 * uses AES-CBC encryption to protect the video source URLs.
 *
 * The page HTML contains:
 *   1. An encrypted data string (in a script tag or data attribute)
 *   2. The decryption requires a key + IV that are hardcoded in their
 *      JavaScript bundle (usually enc-ajax.js or similar)
 *
 * ============================================================
 * HOW TO EXTRACT/UPDATE THESE KEYS WHEN THEY ROTATE:
 *
 * 1. Open https://s3taku.com/embed/{any-valid-id} in browser
 * 2. Open DevTools → Sources → search for the JS bundle
 *    (usually named something like 'enc-ajax.js' or similar)
 * 3. Search the bundle for: CryptoJS.AES.decrypt
 * 4. Near that call you will find two string literals:
 *    - The encryption key (usually 32 chars)
 *    - The IV (usually 16 chars)
 * 5. They may be obfuscated — look for string concatenation
 *    or character code arrays being joined
 * 6. To verify: copy the encrypted sources from the page,
 *    attempt decryption with your extracted key — if you get
 *    valid JSON with a "file" property, the key is correct
 * 7. Update ENCRYPTION_KEY and IV below
 *
 * Rotation frequency: typically every 2-8 weeks
 * When broken: canary dashboard will show S3taku as RED
 * ============================================================
 */
// These keys must be manually extracted from S3taku's JS bundle.
// See extraction instructions above.
const ENCRYPTION_KEY = "REPLACE_WITH_EXTRACTED_KEY";
const IV = "REPLACE_WITH_EXTRACTED_IV";
/**
 * Decrypt an AES-CBC encrypted sources string from S3taku.
 */
function decryptSources(encrypted) {
    try {
        const keyBytes = crypto_js_1.default.enc.Utf8.parse(ENCRYPTION_KEY);
        const ivBytes = crypto_js_1.default.enc.Utf8.parse(IV);
        const decrypted = crypto_js_1.default.AES.decrypt(encrypted, keyBytes, {
            iv: ivBytes,
            mode: crypto_js_1.default.mode.CBC,
            padding: crypto_js_1.default.pad.Pkcs7,
        });
        const json = decrypted.toString(crypto_js_1.default.enc.Utf8);
        if (!json || json.length === 0) {
            throw new Error("Decryption produced empty result");
        }
        const parsed = JSON.parse(json);
        return parsed.map((s) => ({
            url: s.file,
            quality: s.label || "auto",
            isM3U8: s.file.includes(".m3u8") || s.type === "hls",
            subtitles: [],
        }));
    }
    catch (err) {
        // Decryption failed — key has likely rotated
        // Check canary dashboard and update ENCRYPTION_KEY + IV above
        throw new Error(`S3taku decryption failed — key may have rotated: ${err instanceof Error ? err.message : "unknown"}`);
    }
}
class S3takuExtractor {
    domains = [
        "s3taku.com",
        "embtaku.pro",
        "embtaku.com",
        "gogoplay.io",
        "gogoplay4.com",
        "gogohd.net",
        "gogohd.pro",
        "playgo1.cc",
    ];
    canHandle(url) {
        try {
            const hostname = new URL(url).hostname;
            return this.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
        }
        catch {
            return false;
        }
    }
    async extract(embedUrl) {
        const start = Date.now();
        // Fetch the embed page
        const res = await fetch(embedUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Referer: embedUrl,
            },
            signal: AbortSignal.timeout(8000),
        });
        const html = await res.text();
        // ── Extract the encrypted data ────────────────────────────────────────────
        // S3taku stores encrypted source data in a script tag or data attribute.
        // Common patterns:
        //   data-value="ENCRYPTED_STRING"
        //   var encrypted = "ENCRYPTED_STRING"
        //   enc_data = "ENCRYPTED_STRING"
        //
        // We try multiple patterns to be resilient to minor page changes.
        let encryptedData = null;
        // Pattern 1: data-value attribute on a script/div element
        const dataValueMatch = html.match(/data-value\s*=\s*["']([A-Za-z0-9+/=]+)["']/);
        if (dataValueMatch) {
            encryptedData = dataValueMatch[1];
        }
        // Pattern 2: JavaScript variable assignment
        if (!encryptedData) {
            const varMatch = html.match(/(?:enc_data|encrypted|data)\s*=\s*["']([A-Za-z0-9+/=]+)["']/);
            if (varMatch) {
                encryptedData = varMatch[1];
            }
        }
        // Pattern 3: AJAX response embedded in the page (crypto_value)
        if (!encryptedData) {
            const cryptoMatch = html.match(/crypto_value\s*[:=]\s*["']([A-Za-z0-9+/=]+)["']/);
            if (cryptoMatch) {
                encryptedData = cryptoMatch[1];
            }
        }
        if (!encryptedData) {
            throw new Error("S3taku: encrypted data not found in page HTML — page structure may have changed");
        }
        // ── Decrypt and parse ─────────────────────────────────────────────────────
        const sources = decryptSources(encryptedData);
        if (sources.length === 0) {
            throw new Error("S3taku: decryption succeeded but no sources found");
        }
        const latencyMs = Date.now() - start;
        // Extract subtitles if present
        const subtitleMatches = [
            ...html.matchAll(/(?:track|subtitle).*?src\s*=\s*["']([^"']+)["'].*?(?:label|srclang)\s*=\s*["']([^"']+)["']/gi),
        ];
        const subtitles = subtitleMatches.map((m) => ({
            url: m[1],
            lang: m[2],
            format: "vtt",
        }));
        return {
            sources,
            subtitles,
            latencyMs,
        };
    }
}
exports.S3takuExtractor = S3takuExtractor;
//# sourceMappingURL=s3taku.js.map