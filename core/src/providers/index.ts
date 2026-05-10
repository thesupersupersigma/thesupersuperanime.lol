import { GogoAnimeProvider } from "./gogoanime";
import { AniWaveProvider } from "./aniwave";
import type { BaseProvider, EpisodeSource } from "./base";

export const providers: BaseProvider[] = [
  new GogoAnimeProvider(),
  new AniWaveProvider(),
];

/**
 * Race all providers — return first successful result.
 * Uses Promise.any so the fastest provider that returns
 * valid sources wins. All others are abandoned.
 *
 * If ALL providers fail, Promise.any rejects with AggregateError.
 */
export async function getRacedSources(
  animeTitle: string,
  episodeNum: number
): Promise<EpisodeSource> {
  return Promise.any(
    providers.map(async (p) => {
      const id = await p.findEpisodeId(animeTitle, episodeNum);
      if (!id) throw new Error(`[${p.id}] Episode not found`);
      const result = await p.getSources(id);
      if (result.sources.length === 0)
        throw new Error(`[${p.id}] No sources extracted`);
      return result;
    })
  );
}
