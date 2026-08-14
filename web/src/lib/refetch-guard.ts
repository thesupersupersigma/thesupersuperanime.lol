/**
 * Loop guard for the watch page's dead-token source refetch.
 *
 * The original guard was a pure time throttle:
 *
 *     if (now - lastRefetchRef.current < 5000) { ...give up... }
 *     lastRefetchRef.current = now;
 *
 * hls.js exhausts its own retries in roughly 6-10 seconds — LONGER than that
 * 5s window — so the cycle "fatal error → refetch → fresh tokens → same dead
 * upstream → fatal error" never tripped it. Each iteration costs a full
 * /api/source call (up to ~65s of upstream timeout budget: 15s /info + 30s
 * primary /episodes + 20s secondary + 15s /watch) plus a batch of DB inserts,
 * and it only terminated when the rate limiter 429'd — at which point the user
 * couldn't load any episode for a minute.
 *
 * Counting CONSECUTIVE attempts inside a window fixes the class of bug rather
 * than the specific timing: however long hls.js takes to give up, the third
 * failure in a minute stops the loop. The counter resets once the window
 * lapses, so a token that legitimately expires hours into a session still gets
 * its refetch.
 */

export interface RefetchState {
  /** Timestamp of the previous attempt (0 if none). */
  lastAt: number;
  /** Consecutive attempts inside the window. */
  attempts: number;
}

export interface RefetchOptions {
  windowMs: number;
  maxAttempts: number;
}

export interface RefetchDecision {
  allow: boolean;
  next: RefetchState;
}

export function evaluateRefetch(
  state: RefetchState,
  now: number,
  { windowMs, maxAttempts }: RefetchOptions,
): RefetchDecision {
  const withinWindow = state.lastAt !== 0 && now - state.lastAt < windowMs;
  const attempts = withinWindow ? state.attempts + 1 : 1;
  return {
    allow: attempts <= maxAttempts,
    next: { lastAt: now, attempts },
  };
}
