import type { BaseProvider, EpisodeSource } from "./base";
export declare const providers: BaseProvider[];
/**
 * Race all providers — return first successful result.
 * Uses Promise.any so the fastest provider that returns
 * valid sources wins. All others are abandoned.
 *
 * If ALL providers fail, Promise.any rejects with AggregateError.
 */
export declare function getRacedSources(animeTitle: string, episodeNum: number): Promise<EpisodeSource>;
//# sourceMappingURL=index.d.ts.map