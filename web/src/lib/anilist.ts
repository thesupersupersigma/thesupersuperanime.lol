// ─────────────────────────────────────────────
// AniList GraphQL Client
// All anime metadata queries in one typed file
// ─────────────────────────────────────────────

import { errorInfo } from "@/lib/log-error";

const ANILIST_URL = "https://graphql.anilist.co";

// ── Types ──────────────────────────────────────

export interface AnilistTitle {
  romaji: string;
  english: string | null;
  native: string | null;
}

export interface AnilistCoverImage {
  large: string;
  medium: string;
  extraLarge: string;
  color: string | null;
}

export interface AnilistStudio {
  name: string;
}

export interface AnilistStudioConnection {
  edges: {
    isMain: boolean;
    node: AnilistStudio;
  }[];
}

export interface AnilistMedia {
  id: number;
  idMal: number | null;
  title: AnilistTitle;
  coverImage: AnilistCoverImage;
  bannerImage: string | null;
  episodes: number | null;
  averageScore: number | null;
  meanScore: number | null;
  genres: string[];
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  description: string | null;
  studios: AnilistStudioConnection;
  nextAiringEpisode: {
    episode: number;
    airingAt: number;
  } | null;
}

export interface AnilistSearchResult {
  id: number;
  title: AnilistTitle;
  coverImage: AnilistCoverImage;
  episodes: number | null;
  averageScore: number | null;
  genres: string[];
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
}

// ── Fragments ──────────────────────────────────

const MEDIA_FRAGMENT = `
  fragment MediaFields on Media {
    id
    idMal
    title {
      romaji
      english
      native
    }
    coverImage {
      large
      medium
      extraLarge
      color
    }
    bannerImage
    episodes
    averageScore
    meanScore
    genres
    format
    status
    season
    seasonYear
    startDate {
      year
      month
      day
    }
    description(asHtml: false)
    studios {
      edges {
        isMain
        node {
          name
        }
      }
    }
    nextAiringEpisode {
      episode
      airingAt
    }
  }
`;

const SEARCH_FRAGMENT = `
  fragment SearchFields on Media {
    id
    title {
      romaji
      english
      native
    }
    coverImage {
      large
      medium
      extraLarge
      color
    }
    episodes
    averageScore
    genres
    format
    status
    season
    seasonYear
  }
`;

// ── Query helpers ──────────────────────────────

// Concurrency cap: since migrating to a single VM IP, all AniList traffic shares
// one rate-limit bucket. Limit how many AniList network requests run at once so
// cold-cache bursts (e.g. a fresh deploy loading the home page) don't trip the
// limit. Cache hits resolve fast and free their slot, so warm pages are barely
// affected.
const MAX_CONCURRENT = 5;
let activeRequests = 0;
const waitQueue: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve));
  activeRequests++;
}

function releaseSlot(): void {
  activeRequests--;
  const next = waitQueue.shift();
  if (next) next();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_RETRIES = 3;
/** Per-attempt network timeout. Every other outbound call in the app sets one (5-15s). */
const ANILIST_ATTEMPT_TIMEOUT_MS = 10_000;
/** Hard ceiling on how long one call may hold a concurrency slot, retries and backoff included. */
const ANILIST_TOTAL_BUDGET_MS = 25_000;

async function anilistFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
  cache: RequestCache = "force-cache",
  revalidate?: number
): Promise<T> {
  const fetchOptions: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache,
    ...(revalidate ? { next: { revalidate } } : {}),
  };

  await acquireSlot();
  const deadline = Date.now() + ANILIST_TOTAL_BUDGET_MS;
  try {
    let res!: Response;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Per-attempt timeout. There was NO signal here at all, so the only
      // backstop was undici's ~300s default -- while holding one of just
      // MAX_CONCURRENT=5 process-wide slots. getAnimeById blocks the server
      // render of the watch, anime and home pages, so five hung AniList
      // connections turned one upstream incident into a site-wide five-minute
      // hang with every queued caller waiting behind them on an unbounded
      // queue that has no deadline of its own.
      res = await fetch(ANILIST_URL, {
        ...fetchOptions,
        signal: AbortSignal.timeout(ANILIST_ATTEMPT_TIMEOUT_MS),
      });

      // 429: don't fail immediately. Honor Retry-After if present, otherwise
      // back off exponentially (1s, 2s, 4s), then retry the same request.
      if (res.status === 429 && attempt < MAX_RETRIES - 1) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1000 * 2 ** attempt;
        // Don't start another attempt we can't finish inside the budget --
        // the backoff sleeps hold the slot too.
        if (Date.now() + waitMs >= deadline) break;
        await sleep(waitMs);
        continue;
      }

      break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AniList API error ${res.status}: ${text}`);
    }

    const json = await res.json();

    if (json.errors) {
      throw new Error(
        `AniList GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join(", ")}`
      );
    }

    return json.data as T;
  } finally {
    releaseSlot();
  }
}

// ── Public API ─────────────────────────────────

/**
 * Get trending anime
 */
export async function getTrending(
  page = 1,
  perPage = 20
): Promise<AnilistMedia[]> {
  const query = `
    ${MEDIA_FRAGMENT}
    query TrendingAnime($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
          ...MediaFields
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { media: AnilistMedia[] };
  }>(query, { page, perPage }, "force-cache", 3600);

  return data.Page.media;
}

/**
 * Get seasonal anime (current season)
 */
export async function getSeasonal(
  page = 1,
  perPage = 20
): Promise<AnilistMedia[]> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  let season: string;
  if (month >= 1 && month <= 3) season = "WINTER";
  else if (month >= 4 && month <= 6) season = "SPRING";
  else if (month >= 7 && month <= 9) season = "SUMMER";
  else season = "FALL";

  const query = `
    ${MEDIA_FRAGMENT}
    query SeasonalAnime($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
      Page(page: $page, perPage: $perPage) {
        media(season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ...MediaFields
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { media: AnilistMedia[] };
  }>(query, { page, perPage, season, seasonYear: year }, "force-cache", 3600);

  return data.Page.media;
}

export interface SearchFilters {
  genre?: string;
  season?: string;
  seasonYear?: number;
  format?: string;
}

/**
 * Search anime by title and/or filters
 */
export async function searchAnime(
  search: string,
  page = 1,
  perPage = 20,
  filters: SearchFilters = {}
): Promise<AnilistSearchResult[]> {
  const hasFilters = !!(filters.genre || filters.season || filters.seasonYear || filters.format);
  if (!search.trim() && !hasFilters) return [];

  // SEARCH_MATCH sort is invalid when no search term is provided
  const sort = search.trim() ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"];

  const query = `
    ${SEARCH_FRAGMENT}
    query SearchAnime(
      $search: String,
      $page: Int,
      $perPage: Int,
      $sort: [MediaSort],
      $genre: String,
      $season: MediaSeason,
      $seasonYear: Int,
      $format: MediaFormat
    ) {
      Page(page: $page, perPage: $perPage) {
        media(
          search: $search,
          type: ANIME,
          isAdult: false,
          sort: $sort,
          genre: $genre,
          season: $season,
          seasonYear: $seasonYear,
          format: $format
        ) {
          ...SearchFields
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { media: AnilistSearchResult[] };
  }>(query, {
    search: search.trim() || undefined,
    page,
    perPage,
    sort,
    genre: filters.genre || undefined,
    season: filters.season || undefined,
    seasonYear: filters.seasonYear || undefined,
    format: filters.format || undefined,
  }, "force-cache", 3600);

  return data.Page.media;
}

/**
 * Get anime detail by ID
 */
export async function getAnimeById(
  id: number
): Promise<AnilistMedia | null> {
  const query = `
    ${MEDIA_FRAGMENT}
    query AnimeDetail($id: Int) {
      Media(id: $id, type: ANIME) {
        ...MediaFields
      }
    }
  `;

  try {
    const data = await anilistFetch<{
      Media: AnilistMedia;
    }>(query, { id }, "force-cache", 86400);

    return data.Media;
  } catch (err) {
    // anilistFetch throws a rich "AniList API error {status}: {text}" after its
    // 429 retries. Callers treat null as "anime not found" and filter it out of
    // an allSettled, so without this line an AniList outage looks identical to
    // a missing anime and nothing anywhere records it.
    console.error("[anilist] getAnimeById failed", { animeId: id, ...errorInfo(err) });
    return null;
  }
}

/**
 * Get top anime for a genre, sorted by score descending.
 * Fetches more than needed so the caller can re-rank with community votes.
 */
export async function getAnimeByGenre(
  genre: string,
  perPage = 50
): Promise<AnilistMedia[]> {
  const query = `
    ${MEDIA_FRAGMENT}
    query AnimeByGenre($genre: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(genre: $genre, sort: SCORE_DESC, type: ANIME, isAdult: false) {
          ...MediaFields
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { media: AnilistMedia[] };
  }>(query, { genre, perPage }, "force-cache", 3600);

  return data.Page.media;
}

/**
 * Get display title — prefers English, falls back to Romaji
 */
export function getDisplayTitle(title: AnilistTitle): string {
  return title.english || title.romaji || title.native || "Unknown";
}

/**
 * Get main studio name
 */
export function getMainStudio(studios: AnilistStudioConnection): string | null {
  const main = studios.edges.find((e) => e.isMain);
  return main?.node.name ?? studios.edges[0]?.node.name ?? null;
}

/**
 * Get currently airing anime with upcoming episodes, sorted by next air time ascending
 */
export async function getAiringSoon(
  page = 1,
  perPage = 20
): Promise<AnilistMedia[]> {
  const query = `
    ${MEDIA_FRAGMENT}
    query AiringSoon($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(
          status: RELEASING,
          type: ANIME,
          isAdult: false,
          sort: POPULARITY_DESC
        ) {
          ...MediaFields
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { media: AnilistMedia[] };
  }>(query, { page, perPage }, "force-cache", 1800);

  // Sort by next airing time ascending so soonest episode is first
  return data.Page.media.sort((a, b) => {
    const aTime = a.nextAiringEpisode?.airingAt ?? Infinity;
    const bTime = b.nextAiringEpisode?.airingAt ?? Infinity;
    return aTime - bTime;
  });
}

export interface EpisodeSchedule {
  schedule: Record<number, number>;
  streamingEpisodes: { title: string; thumbnail: string }[];
}

/**
 * Get per-episode air dates and streaming episode thumbnails for an anime
 */
export async function getEpisodeSchedule(id: number): Promise<EpisodeSchedule> {
  const query = `
    query EpisodeSchedule($id: Int) {
      Media(id: $id, type: ANIME) {
        airingSchedule(notYetAired: false) {
          nodes {
            episode
            airingAt
          }
        }
        streamingEpisodes {
          title
          thumbnail
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Media: {
      airingSchedule: { nodes: { episode: number; airingAt: number }[] };
      streamingEpisodes: { title: string; thumbnail: string }[];
    };
  }>(query, { id }, "force-cache", 3600);

  const schedule: Record<number, number> = {};
  for (const node of data.Media.airingSchedule.nodes) {
    schedule[node.episode] = node.airingAt;
  }

  return {
    schedule,
    streamingEpisodes: data.Media.streamingEpisodes,
  };
}

/**
 * Get anime that haven't started airing yet, sorted by popularity
 */
export async function getUpcoming(
  page = 1,
  perPage = 20
): Promise<AnilistMedia[]> {
  const query = `
    ${MEDIA_FRAGMENT}
    query UpcomingAnime($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(
          status: NOT_YET_RELEASED,
          type: ANIME,
          isAdult: false,
          sort: POPULARITY_DESC
        ) {
          ...MediaFields
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { media: AnilistMedia[] };
  }>(query, { page, perPage }, "force-cache", 3600);

  return data.Page.media;
}
