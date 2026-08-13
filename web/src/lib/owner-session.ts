/**
 * Owner-scoped session ids for user-owned rows.
 *
 * `WatchHistory` and `Watchlist` each carry TWO unique constraints:
 *   @@unique([userId, episodeId])   / @@unique([userId, animeId])
 *   @@unique([sessionId, episodeId]) / @@unique([sessionId, animeId])
 *
 * Upserts for logged-in users key on the `userId` pair, but the create branch
 * also has to supply the non-nullable `sessionId`. Writing the *browser's*
 * session id there let the second constraint collide across accounts: user A
 * and user B sharing one browser (same `session-id` cookie, which is never
 * rotated) both resolve to the same `(sessionId, episodeId)` pair, so B's
 * create raised P2002 — permanently, since retrying always re-collides.
 *
 * The fix is to give logged-in rows a session id derived from the user, so the
 * second constraint degrades into a restatement of the first one and can never
 * disagree with it. Anonymous rows keep the real browser session id, which is
 * what identifies them.
 *
 * The `u:` prefix namespaces these away from browser session ids (minted by
 * `generateId()` in auth.ts as `s<base36>…`) so the two can never alias.
 */

export const OWNED_SESSION_PREFIX = "u:";

/** Session id to store on rows owned by a logged-in user. */
export function ownedSessionId(userId: string): string {
  return `${OWNED_SESSION_PREFIX}${userId}`;
}

/** True when a session id belongs to an account rather than an anonymous browser. */
export function isOwnedSessionId(sessionId: string): boolean {
  return sessionId.startsWith(OWNED_SESSION_PREFIX);
}
