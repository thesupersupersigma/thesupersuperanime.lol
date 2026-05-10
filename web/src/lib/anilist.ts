// ─────────────────────────────────────────────
// AniList GraphQL Client
// All anime metadata queries in one typed file
// ─────────────────────────────────────────────

const ANILIST_URL = "https://graphql.anilist.co";

// ── Types ──────────────────────────────────────

export interface AnilistTitle {
  romaji: string;
  english: string | null;
  native: string | null;
}

export interface AnilistCoverImage {
  large: string;
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
    title {
      romaji
      english
      native
    }
    coverImage {
      large
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

  const res = await fetch(ANILIST_URL, fetchOptions);

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

/**
 * Search anime by title
 */
export async function searchAnime(
  search: string,
  page = 1,
  perPage = 20
): Promise<AnilistSearchResult[]> {
  if (!search.trim()) return [];

  const query = `
    ${SEARCH_FRAGMENT}
    query SearchAnime($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
          ...SearchFields
        }
      }
    }
  `;

  const data = await anilistFetch<{
    Page: { media: AnilistSearchResult[] };
  }>(query, { search, page, perPage }, "no-store");

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
  } catch {
    return null;
  }
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
