import { createHmac } from "crypto";

/**
 * Deterministic id for a segment/key token minted while rewriting a playlist.
 *
 * The playlist branch of /api/proxy/[token] writes one SourceToken row per
 * URI in the upstream playlist. Those ids used to be `randomBytes(24)`, so the
 * same playlist fetched twice produced two disjoint sets of rows that could
 * never collide — and a playlist token is `isM3U8`, so the single-use check
 * never applies and one token stays replayable for its full 3h life. An
 * ordinary episode view wrote 250-1000 rows; a replayed token wrote that many
 * again, every time.
 *
 * Deriving the id from (parent token, segment URL) instead makes a replay
 * produce the *same* primary keys, so `createMany({ skipDuplicates: true })`
 * turns it into a no-op.
 *
 * Keyed with TOKEN_SECRET via HMAC, so possessing a segment URL doesn't let
 * anyone predict or forge its token id. Truncated to 48 hex chars to match the
 * previous `randomBytes(24).toString("hex")` width — 192 bits of a SHA-256
 * HMAC, far past any collision concern for this population.
 */
export function deriveSegmentTokenId(parentToken: string, url: string, tokenSecret: string): string {
  return createHmac("sha256", tokenSecret)
    .update(`${parentToken}|${url}`)
    .digest("hex")
    .slice(0, 48);
}
