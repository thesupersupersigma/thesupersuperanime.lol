/**
 * Simple in-memory rate limiter.
 * In-memory is fine since this runs server-side.
 * Resets on server restart — acceptable for this use case.
 */

const requests = new Map<string, number[]>();

/**
 * Check if a request is within rate limits.
 * Returns true if allowed, false if rate-limited.
 *
 * @param key      - Unique identifier (e.g. session ID)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs    - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const timestamps = (requests.get(key) ?? []).filter(
    (t) => now - t < windowMs
  );

  if (timestamps.length >= maxRequests) return false;

  timestamps.push(now);
  if (timestamps.length === 0) {
    requests.delete(key);
  } else {
    requests.set(key, timestamps);
  }
  return true;
}
