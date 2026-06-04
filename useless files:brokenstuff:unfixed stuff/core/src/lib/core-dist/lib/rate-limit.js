"use strict";
/**
 * Simple in-memory rate limiter.
 * In-memory is fine since this runs server-side.
 * Resets on server restart — acceptable for this use case.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
const requests = new Map();
/**
 * Check if a request is within rate limits.
 * Returns true if allowed, false if rate-limited.
 *
 * @param key      - Unique identifier (e.g. session ID)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs    - Window duration in milliseconds
 */
function checkRateLimit(key, maxRequests = 10, windowMs = 60_000) {
    const now = Date.now();
    const timestamps = (requests.get(key) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests)
        return false;
    timestamps.push(now);
    if (timestamps.length === 0) {
        requests.delete(key);
    }
    else {
        requests.set(key, timestamps);
    }
    return true;
}
//# sourceMappingURL=rate-limit.js.map