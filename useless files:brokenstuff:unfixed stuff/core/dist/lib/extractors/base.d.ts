import type { VideoSource, Subtitle } from "../../providers/base";
export interface ExtractorResult {
    sources: VideoSource[];
    subtitles: Subtitle[];
    latencyMs: number;
}
export interface BaseExtractor {
    /** Domain patterns this extractor handles */
    domains: string[];
    /** Extract stream URL(s) from an embed URL */
    extract(embedUrl: string): Promise<ExtractorResult>;
    /** Returns true if this extractor can handle the given URL */
    canHandle(url: string): boolean;
}
//# sourceMappingURL=base.d.ts.map