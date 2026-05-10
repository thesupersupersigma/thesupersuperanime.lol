/**
 * Simple in-memory rate limiter.
 * In-memory is fine since this runs server-side.
 * Resets on server restart — acceptable for this use case.
 */
/**
 * Check if a request is within rate limits.
 * Returns true if allowed, false if rate-limited.
 *
 * @param key      - Unique identifier (e.g. session ID)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs    - Window duration in milliseconds
 */
export declare function checkRateLimit(key: string, maxRequests?: number, windowMs?: number): boolean;
//# sourceMappingURL=rate-limit.d.ts.map