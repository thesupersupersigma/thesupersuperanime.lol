// AniList's canonical genre list.
// Used for validation and the genres index page.
export const ANILIST_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
] as const;

export type AnilistGenre = (typeof ANILIST_GENRES)[number];

// Visual accent color per genre — used on genre cards
export const GENRE_COLORS: Record<string, string> = {
  "Action":       "#ef4444",
  "Adventure":    "#f97316",
  "Comedy":       "#eab308",
  "Drama":        "#ec4899",
  "Ecchi":        "#f43f5e",
  "Fantasy":      "#8b5cf6",
  "Horror":       "#dc2626",
  "Mahou Shoujo": "#e879f9",
  "Mecha":        "#64748b",
  "Music":        "#14b8a6",
  "Mystery":      "#6366f1",
  "Psychological":"#a855f7",
  "Romance":      "#f472b6",
  "Sci-Fi":       "#06b6d4",
  "Slice of Life":"#22c55e",
  "Sports":       "#3b82f6",
  "Supernatural": "#7c3aed",
  "Thriller":     "#b45309",
};

// Short description per genre shown on index cards
export const GENRE_DESCRIPTIONS: Record<string, string> = {
  "Action":        "High-octane fights, battles & non-stop thrills",
  "Adventure":     "Journeys through vast worlds and unknown lands",
  "Comedy":        "Laugh-out-loud moments and hilarious chaos",
  "Drama":         "Emotional stories built on real human struggles",
  "Ecchi":         "Fan-service and mature-leaning comedy",
  "Fantasy":       "Magic, mythical creatures, and other worlds",
  "Horror":        "Fear, dread, and things that go bump in the night",
  "Mahou Shoujo":  "Magical girls transforming evil into sparkles",
  "Mecha":         "Giant robots and the pilots who control them",
  "Music":         "Bands, idols, and the power of sound",
  "Mystery":       "Whodunits, conspiracies, and hidden truths",
  "Psychological": "Mind-bending narratives that question reality",
  "Romance":       "Love, heartbreak, and everything in between",
  "Sci-Fi":        "Technology, space, and speculative futures",
  "Slice of Life": "Quiet, authentic moments of everyday life",
  "Sports":        "Competition, teamwork, and the will to win",
  "Supernatural":  "Spirits, powers, and forces beyond explanation",
  "Thriller":      "Edge-of-your-seat suspense and mounting tension",
};
