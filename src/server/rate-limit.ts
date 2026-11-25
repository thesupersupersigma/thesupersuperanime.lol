// Per-IP limits for the routes that cost the API real work (search, streams). Kept in memory: they only need to stop
// one visitor from hammering us, a restart forgetting the counts is harmless, and the site runs as one process.
// shortcut: per process; move to the database (Better Auth's rateLimit table) if the site ever runs several replicas.

type Window = { start: number; count: number }
const windows = new Map<string, Window>()

/** Fixed one-minute-style window. Returns seconds to wait when over the limit, else 0. */
export function hit(key: string, limit: number, windowMs = 60_000, now = Date.now()): number {
  const w = windows.get(key)
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 })
    if (windows.size > 10_000) prune(now, windowMs)
    return 0
  }
  if (w.count >= limit) return Math.ceil((w.start + windowMs - now) / 1000)
  w.count++
  return 0
}

function prune(now: number, windowMs: number) {
  for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k)
}

export const LIMITS = { search: 60, streams: 30 } as const

/** 429 answer with Retry-After, or null when the request may go ahead. */
export function limited(route: keyof typeof LIMITS, ip: string | null): Response | null {
  const wait = hit(`${route}:${ip ?? 'unknown'}`, LIMITS[route])
  if (!wait) return null
  return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': String(wait) } })
}
