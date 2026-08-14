/**
 * In-memory sliding-window rate limiter.
 *
 * Replaces `checkRateLimit` from the pre-built `core-dist` bundle, which had an
 * unreachable eviction branch:
 *
 *     timestamps.push(now);
 *     if (timestamps.length === 0) requests.delete(key);   // never true
 *     else requests.set(key, timestamps);
 *
 * The delete could never run, so the module-level Map grew one permanent entry
 * per distinct key, forever, in a long-lived `output: "standalone"` process. A
 * client spraying distinct keys leaked heap on every request. (core-dist is a
 * committed build artifact, so the fix lives here and the call sites moved.)
 *
 * Still per-process and still resets on deploy: with more than one instance the
 * effective limit is `maxRequests x instances`. That's a known limitation, not
 * an oversight — a shared store (Postgres/Redis) is the real fix if this ever
 * needs to be exact.
 */

interface Bucket {
  /** Timestamps of allowed hits, oldest first, pruned to the window. */
  hits: number[];
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

/** Full sweep at most this often, so cost stays amortised. */
const SWEEP_INTERVAL_MS = 60_000;
/** Hard ceiling on tracked keys, in case a sprayer outpaces the sweep. */
const MAX_KEYS = 50_000;

let nextSweepAt = 0;

/** Drop every bucket whose window has fully elapsed. */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    const newest = bucket.hits.length > 0 ? bucket.hits[bucket.hits.length - 1] : 0;
    if (now - newest >= bucket.windowMs) buckets.delete(key);
  }
  nextSweepAt = now + SWEEP_INTERVAL_MS;
}

/**
 * Returns true when the request is allowed, false when it is rate-limited.
 *
 * `now` is injectable so the sliding window and the eviction behaviour can be
 * tested without sleeping.
 */
export function checkRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60_000,
  now: number = Date.now(),
  { record = true }: { record?: boolean } = {},
): boolean {
  if (now >= nextSweepAt) sweep(now);

  const existing = buckets.get(key);
  const hits = existing ? existing.hits.filter((t) => now - t < windowMs) : [];

  // delete-then-set moves the key to the end of the Map's insertion order, so
  // the MAX_KEYS eviction below drops least-recently-used keys rather than
  // whichever happened to be created first.
  buckets.delete(key);

  if (hits.length >= maxRequests) {
    // Keep the pruned list so the window keeps sliding while blocked.
    buckets.set(key, { hits, windowMs });
    return false;
  }

  // `record: false` asks "would this be allowed?" without consuming budget.
  // Used by the auth actions, which count only FAILED attempts so a legitimate
  // user with the correct password is never throttled — and, for sign-in,
  // so an attacker can't burn a victim's budget with wrong passwords.
  if (!record) {
    // Don't materialise a bucket for a key that has no recorded attempts, or
    // every successful login would leak a Map entry.
    if (hits.length > 0) buckets.set(key, { hits, windowMs });
    return true;
  }

  hits.push(now);
  buckets.set(key, { hits, windowMs });

  if (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next();
    if (!oldest.done) buckets.delete(oldest.value);
  }

  return true;
}

/** Number of tracked keys. Exported for tests and diagnostics. */
export function trackedKeyCount(): number {
  return buckets.size;
}

/** Clear all state. Tests only. */
export function resetRateLimits(): void {
  buckets.clear();
  nextSweepAt = 0;
}
