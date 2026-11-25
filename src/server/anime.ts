import 'server-only'
import type { AnimeT } from '@reconsumet/client'
import { cache } from 'react'
import { getConfig } from '@/config'
import { ReconsumetError, reconsumet } from './reconsumet'

export type Episode = { number: number; title?: string; thumbnail?: string; sub: boolean; dub: boolean }
export type SourceInfo = { id: string; name: string; healthy: boolean | null; episodes: number }
/** `busy`: AniList budget used and this anime never fetched (503 anilist_cap) — retry in a minute, not a 404. */
export type LoadError = 'not_found' | 'busy' | 'down'

/** Details for one anime; deduped per request (metadata + page). */
export const loadAnime = cache(async (id: number): Promise<{ anime: AnimeT } | { error: LoadError }> => {
  try {
    return { anime: await reconsumet.anime(id) }
  } catch (e) {
    if (!(e instanceof ReconsumetError)) throw e
    if (e.kind === 'not_found') return { error: 'not_found' }
    return { error: e.code === 'anilist_cap' ? 'busy' : 'down' }
  }
})

/** next/image only fetches IMAGE_HOSTS (src/proxy.ts); anything else would be a broken image, so drop it here. */
export function allowedImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && getConfig().imageHosts.includes(u.hostname) ? url : undefined
  } catch {
    return undefined
  }
}

/**
 * Which sources have this show (with their latest health check), and one episode list merged across them: an episode
 * is SUB/DUB if any source has it so, and takes the first title/thumbnail any source gives.
 */
export const loadAvailability = cache(async (id: number) => {
  const sources = await reconsumet.sources().catch(() => [])
  const lists = await Promise.all(
    sources.map((s) =>
      reconsumet
        .episodes(id, s.id)
        .then((r) => r.episodes)
        .catch(() => null),
    ),
  )
  const byNumber = new Map<number, Episode>()
  lists.forEach((eps) => {
    for (const e of eps ?? []) {
      const m = byNumber.get(e.number) ?? { number: e.number, sub: false, dub: false }
      m.sub ||= e.sub ?? !e.dub
      m.dub ||= !!e.dub
      m.title ??= e.title
      m.thumbnail ??= allowedImage(e.thumbnail)
      byNumber.set(e.number, m)
    }
  })
  const info: SourceInfo[] = sources.flatMap((s, i) =>
    lists[i]?.length
      ? [{ id: s.id, name: s.name, healthy: s.health ? s.health.ok : null, episodes: lists[i]?.length ?? 0 }]
      : [],
  )
  return {
    sources: info,
    episodes: [...byNumber.values()].sort((a, b) => a.number - b.number),
    // the API itself was unreachable (vs. "no source has this show")
    down: sources.length === 0,
  }
})

/** Highest episode that can exist: AniList's count, else the one before the next airing, else unknown. */
export function maxEpisode(a: AnimeT): number | null {
  if (a.episodes) return a.episodes
  if (a.nextAiringEpisode) return a.nextAiringEpisode.episode - 1
  return null
}
