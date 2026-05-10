export interface ProviderCheckResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  /** The m3u8/mp4 URL if found — never logged in plain text */
  sourceUrl?: string;
}

export interface BaseProvider {
  id: string;
  displayName: string;
  /** Health check — tries to get a source URL for a known test episode */
  check(): Promise<ProviderCheckResult>;
}
