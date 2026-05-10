import { VibePlayerExtractor } from "./vibeplayer";
import { StreamtapeExtractor } from "./streamtape";
import { S3takuExtractor } from "./s3taku";
import type { BaseExtractor, ExtractorResult } from "./base";

const extractors: BaseExtractor[] = [
  new VibePlayerExtractor(),
  new StreamtapeExtractor(),
  new S3takuExtractor(),
];

/**
 * Find an extractor that can handle the given embed URL.
 */
export function getExtractor(embedUrl: string): BaseExtractor | null {
  return extractors.find((e) => e.canHandle(embedUrl)) ?? null;
}

/**
 * Extract video source(s) from an embed URL.
 * Finds the right extractor automatically based on the URL's domain.
 * Returns null if no extractor matches or extraction fails.
 *
 * Never logs the full embed URL — only the hostname for debugging.
 */
export async function extractSource(
  embedUrl: string
): Promise<ExtractorResult | null> {
  const extractor = getExtractor(embedUrl);
  if (!extractor) {
    let hostname: string;
    try {
      hostname = new URL(embedUrl).hostname;
    } catch {
      hostname = "invalid-url";
    }
    console.error(`[extractor] No extractor found for: ${hostname}`);
    return null;
  }

  try {
    const result = await Promise.race([
      extractor.extract(embedUrl),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Extractor timeout after 10s")),
          10000
        )
      ),
    ]);
    return result;
  } catch (err) {
    // Log hostname only — NEVER log the full URL
    let hostname: string;
    try {
      hostname = new URL(embedUrl).hostname;
    } catch {
      hostname = "invalid-url";
    }
    console.error(
      `[extractor] Failed for ${hostname}:`,
      (err as Error).message
    );
    return null;
  }
}

export type { BaseExtractor, ExtractorResult };
