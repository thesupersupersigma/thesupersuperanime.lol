export interface VideoSource {
  /** Raw stream URL — NEVER sent to browser, NEVER logged in plain text */
  url: string;
  /** "1080p" | "720p" | "480p" | "360p" | "auto" */
  quality: string;
  /** true for HLS (.m3u8), false for mp4 */
  isM3U8: boolean;
  subtitles: Subtitle[];
  /** session cookies needed to fetch this stream */
  cookies?: string;
}

export interface Subtitle {
  url: string;
  /** "English", "Japanese", etc. */
  lang: string;
  format: "vtt" | "srt" | "ass";
}

export interface EpisodeSource {
  sources: VideoSource[];
  provider: string;
  latencyMs: number;
}

export interface ProviderCheckResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface BaseProvider {
  id: string;
  displayName: string;

  /**
   * Find the provider-specific episode ID for a given anime + episode number.
   * Returns null if the anime/episode was not found on this provider.
   */
  findEpisodeId(
    animeTitle: string,
    episodeNum: number
  ): Promise<string | null>;

  /**
   * Get video sources for a provider-specific episode ID.
   * The episode ID comes from findEpisodeId().
   */
  getSources(episodeId: string): Promise<EpisodeSource>;

  /**
   * Health check — used by Phase 2 canary dashboard.
   * Tests with Naruto episode 1 (stable, always exists).
   */
  check(): Promise<ProviderCheckResult>;
}
