import type { BaseExtractor, ExtractorResult } from './base';
export declare class VibePlayerExtractor implements BaseExtractor {
    domains: string[];
    canHandle(url: string): boolean;
    extract(embedUrl: string): Promise<ExtractorResult>;
}
//# sourceMappingURL=vibeplayer.d.ts.map