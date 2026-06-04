import type { BaseProvider, EpisodeSource, ProviderCheckResult } from "./base";
/**
 * GogoAnime / Anitaku Provider
 *
 * Flow:
 *   Search → Episode page → iframe src → Extractor (S3taku or Streamtape)
 *
 * Search URL:  https://anitaku.to/search.html?keyword=naruto
 * Episode URL: https://anitaku.to/naruto-episode-1
 * Player:      iframe src → https://s3taku.com/embed/{id}
 *                         or https://embtaku.pro/embed/{id}
 *                         or https://streamtape.com/e/{id}
 */
export declare class GogoAnimeProvider implements BaseProvider {
    id: string;
    displayName: string;
    findEpisodeId(animeTitle: string, episodeNum: number): Promise<string | null>;
    getSources(episodeId: string): Promise<EpisodeSource>;
    check(): Promise<ProviderCheckResult>;
}
//# sourceMappingURL=gogoanime.d.ts.map