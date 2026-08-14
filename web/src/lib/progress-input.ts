/**
 * Input validation for POST /api/progress.
 *
 * The route previously accepted anything: `if (!animeId || !episodeId) 400`,
 * then used `episodeId` verbatim as an upsert key and `Number(animeId)` as a
 * column. `episodeId` is a Postgres `text` column with no length cap and
 * `@@unique([userId, episodeId])`, so every distinct string minted a new row —
 * and `/api/leaderboard` ranks on `_count.episodeId`. Within the 10/min limit
 * that's ~14,400 fabricated "episodes" a day: enough to take #1 and unlock the
 * episode-count and leaderboard badges, each of which fires a real Discord DM
 * and a PUBLIC #badges post.
 *
 * The client always sends `episodeId` as `` `${animeId}-${episodeNum}` `` (see
 * anime-player.tsx and watch-client.tsx), so requiring that shape AND requiring
 * it to agree with the body's `animeId` collapses the id space from "any string"
 * to "one row per real episode of one real anime".
 *
 * NOTE ON WHAT THIS DOES NOT DO: it does not prove the episode exists. That
 * would need an AniList round-trip on every save (this fires roughly every 10
 * seconds of playback) or the scraper API. What it does remove is unbounded row
 * creation and arbitrary-string farming; a determined user can still count
 * episodes of a real anime up to its episode cap.
 */

/** Episode numbers above this are rejected. Longest real series are ~1000-1200. */
export const MAX_EPISODE_NUMBER = 10_000;
/** AniList ids are well under this; the bound keeps the value int4-safe. */
export const MAX_ANIME_ID = 2_147_483_647;
/** 24h in seconds — no legitimate episode is longer. */
export const MAX_DURATION_SECONDS = 86_400;

export interface ProgressInput {
  animeId: number;
  episodeId: string;
  episodeNum: number;
  progress: number;
  duration: number;
}

export type ProgressParseResult =
  | { ok: true; value: ProgressInput }
  | { ok: false; error: string };

function isPositiveInt(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max;
}

/** Non-negative integer seconds, or 0 when absent. Rejects NaN/Infinity/negatives. */
function parseSeconds(v: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: 0 };
  if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: `${field} must be a number` };
  const n = Math.floor(v);
  if (n < 0) return { ok: false, error: `${field} must not be negative` };
  if (n > MAX_DURATION_SECONDS) return { ok: false, error: `${field} exceeds the maximum` };
  return { ok: true, value: n };
}

export function parseProgressInput(body: unknown): ProgressParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object" };
  }
  const { animeId, episodeId, progress, duration } = body as Record<string, unknown>;

  // Accept a numeric string for animeId (the client sends a number, but the
  // route previously coerced, so stay compatible) — then require a real int.
  const animeIdNum = typeof animeId === "string" && /^\d+$/.test(animeId) ? Number(animeId) : animeId;
  if (!isPositiveInt(animeIdNum, MAX_ANIME_ID)) {
    return { ok: false, error: "animeId must be a positive integer" };
  }

  if (typeof episodeId !== "string") {
    return { ok: false, error: "episodeId must be a string" };
  }

  // Exactly `<animeId>-<episodeNum>`, no extra segments, and NO LEADING ZEROS:
  // `5114-1` and `05114-1` both satisfy the numeric cross-check but are
  // different strings, so a permissive pattern would still let one episode mint
  // ten alias rows against the unique index.
  const match = /^([1-9]\d{0,9})-([1-9]\d{0,4})$/.exec(episodeId);
  if (!match) {
    return { ok: false, error: "episodeId must be of the form <animeId>-<episodeNum>" };
  }

  const idFromEpisode = Number(match[1]);
  const episodeNum = Number(match[2]);

  // The cross-check is the load-bearing part: without it `episodeId` is still
  // an arbitrary namespace, just a numeric-looking one.
  if (idFromEpisode !== animeIdNum) {
    return { ok: false, error: "episodeId does not match animeId" };
  }
  if (!isPositiveInt(episodeNum, MAX_EPISODE_NUMBER)) {
    return { ok: false, error: "episode number out of range" };
  }

  const p = parseSeconds(progress, "progress");
  if (!p.ok) return p;
  const d = parseSeconds(duration, "duration");
  if (!d.ok) return d;

  return {
    ok: true,
    value: {
      animeId: animeIdNum,
      episodeId,
      episodeNum,
      progress: p.value,
      duration: d.value,
    },
  };
}
