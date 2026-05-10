import type { BaseProvider, EpisodeSource, ProviderCheckResult } from "./base";
/**
 * AniWave Provider
 *
 * AniWave loads episode data via AJAX — the page HTML alone won't have
 * the video sources. Episode data is fetched from their AJAX endpoints.
 *
 * Flow:
 *   Search → Anime page → AJAX episode list → AJAX episode sources → Extractor
 *
 * Search URL:    https://aniwave.to/filter?keyword=naruto
 * Anime page:    https://aniwave.to/watch/naruto.abc123
 * Episode list:  GET /ajax/episode/list/{animeDataId}
 * Sources:       GET /ajax/episode/sources?id={episodeDataId}
 */
export declare class AniWaveProvider implements BaseProvider {
    id: string;
    displayName: string;
    findEpisodeId(animeTitle: string, episodeNum: number): Promise<string | null>;
    getSources(episodeId: string): Promise<EpisodeSource>;
    check(): Promise<ProviderCheckResult>;
}
//# sourceMappingURL=aniwave.d.ts.map