import type { BaseExtractor, ExtractorResult } from "./base";
/**
 * Find an extractor that can handle the given embed URL.
 */
export declare function getExtractor(embedUrl: string): BaseExtractor | null;
/**
 * Extract video source(s) from an embed URL.
 * Finds the right extractor automatically based on the URL's domain.
 * Returns null if no extractor matches or extraction fails.
 *
 * Never logs the full embed URL — only the hostname for debugging.
 */
export declare function extractSource(embedUrl: string): Promise<ExtractorResult | null>;
export type { BaseExtractor, ExtractorResult };
//# sourceMappingURL=index.d.ts.map