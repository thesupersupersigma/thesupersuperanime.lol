import type { BaseExtractor, ExtractorResult } from "./base";
export declare class S3takuExtractor implements BaseExtractor {
    domains: string[];
    canHandle(url: string): boolean;
    extract(embedUrl: string): Promise<ExtractorResult>;
}
//# sourceMappingURL=s3taku.d.ts.map