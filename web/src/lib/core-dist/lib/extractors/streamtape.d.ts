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
export declare class StreamtapeExtractor implements BaseExtractor {
    domains: string[];
    canHandle(url: string): boolean;
    extract(embedUrl: string): Promise<ExtractorResult>;
}
//# sourceMappingURL=streamtape.d.ts.map