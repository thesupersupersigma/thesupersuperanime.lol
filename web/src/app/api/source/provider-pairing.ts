/**
 * Provider/episode-id pairing for the RECONSUMET-TS scraper.
 *
 * These are the pure decision functions behind `fetchScraper`. They're split
 * out so the pairing rules can be unit-tested without a live scraper — the two
 * bugs they encode were both invisible in production and produced the same
 * user-visible symptom ("a provider randomly disappears between page loads").
 *
 * Background — an episode id is only meaningful to the provider that minted it.
 * AniNeko emits `<slug>/ep-N`; ReAnime expects `<anilistId>/<ep>`. Sending one
 * provider's id to another is a 400, which the caller swallows, so the provider
 * silently vanishes from the server dropdown.
 */

export interface EpisodeRef {
  id: string;
  number: number;
}

export interface EpisodesResponse {
  /** Which provider actually answered. Absent on older builds of the API. */
  provider?: string | null;
  episodes?: EpisodeRef[] | null;
}

export interface InfoMapping {
  provider: string;
  id: string;
  title: string;
  score: number;
}

export interface InfoResponse {
  mappings?: InfoMapping[] | null;
}

/** Canonical key for a provider name. Every map/set in this module uses it. */
export function providerKey(provider: string): string {
  return provider.trim().toLowerCase();
}

/**
 * Ordered list of providers worth querying: the one that answered the
 * unqualified /episodes call first (it's the aggregator's own pick), then every
 * /info mapping we haven't already seen, in the order /info returned them
 * (highest score first).
 */
export function buildProviderQueue(
  primaryEps: EpisodesResponse | null,
  info: InfoResponse | null,
): string[] {
  const queue: string[] = [];
  const seen = new Set<string>();

  const push = (provider: string | null | undefined) => {
    if (!provider) return;
    const key = providerKey(provider);
    if (!key || seen.has(key)) return;
    seen.add(key);
    queue.push(provider);
  };

  push(primaryEps?.provider);
  for (const mapping of info?.mappings ?? []) push(mapping?.provider);

  return queue;
}

/**
 * Providers from the queue that still need an episode list fetched.
 *
 * The bug this replaces was `providerQueue.slice(1)`, which assumed index 0 had
 * already been satisfied by the unqualified /episodes call. When that call
 * failed, timed out, or came back with `provider: null`, index 0 was instead
 * the highest-scored /info mapping — and slicing it off meant it never got an
 * episode list, so it was dropped from the watch calls entirely. With a single
 * mapping that turned a perfectly healthy provider into a hard 404.
 *
 * Keying off what we actually have makes the "already fetched" test true by
 * construction rather than by position.
 */
export function pendingProviders(
  queue: string[],
  episodesByProvider: ReadonlyMap<string, EpisodeRef[]>,
): string[] {
  return queue.filter((provider) => !episodesByProvider.has(providerKey(provider)));
}

export type EpisodeResponseVerdict =
  | { accepted: true; answered: string; episodes: EpisodeRef[] }
  | { accepted: false; reason: "empty" | "mismatch"; answered: string | null };

/**
 * Decide whether an /episodes response may be filed under the provider we
 * asked for.
 *
 * The bug this replaces: the secondary fetch closed over the *requested* name
 * and re-emitted it, so `data.provider` was never read anywhere in the file. If
 * the aggregator answered `?provider=reanime` with an AniNeko body — no mapping
 * for that AniList id, a per-provider scrape failure, or a plain default — the
 * AniNeko episode list was filed under "reanime", and the following
 * `/watch?provider=reanime&episodeId=<anineko-shaped-id>` was a guaranteed 400.
 *
 * A response that doesn't name a provider is trusted (older API builds don't
 * report one); a response that names a *different* provider is rejected rather
 * than re-keyed, because the queue slot for the answering provider is either
 * already filled or will be filled by its own request.
 */
export function verifyEpisodeResponse(
  requested: string,
  data: EpisodesResponse | null | undefined,
): EpisodeResponseVerdict {
  const episodes = data?.episodes;
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return { accepted: false, reason: "empty", answered: data?.provider ?? null };
  }

  const wanted = providerKey(requested);
  const answered = data?.provider ? providerKey(data.provider) : wanted;

  if (answered !== wanted) {
    return { accepted: false, reason: "mismatch", answered };
  }

  return { accepted: true, answered, episodes };
}

export interface WatchCall {
  provider: string;
  episodeId: string;
}

/**
 * Pair each provider with its own episode id for the requested episode number.
 * Providers without an episode list, or without that episode, are skipped.
 */
export function buildWatchCalls(
  queue: string[],
  episodesByProvider: ReadonlyMap<string, EpisodeRef[]>,
  episodeNum: number,
): WatchCall[] {
  const calls: WatchCall[] = [];
  for (const provider of queue) {
    const episodes = episodesByProvider.get(providerKey(provider));
    if (!episodes) continue;
    const episode = episodes.find((e) => e.number === episodeNum);
    if (!episode) continue;
    calls.push({ provider, episodeId: episode.id });
  }
  return calls;
}
