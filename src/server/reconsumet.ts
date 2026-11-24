import 'server-only'
import { type AnimeT, type CatalogEntryT, createClient, type EpisodesT, type StreamsT } from '@reconsumet/client'
import { getConfig } from '@/config'

const TIMEOUT_MS = 8000

/** `down`: unreachable/5xx/timeout · `not_found` · `rate_limited` · `bad_request` (our bug or bad input). */
export class ReconsumetError extends Error {
  constructor(
    readonly kind: 'down' | 'not_found' | 'rate_limited' | 'bad_request',
    readonly status?: number,
    message?: string,
  ) {
    super(message ?? `reconsumet: ${kind}${status ? ` (${status})` : ''}`)
  }
}

function api() {
  const { url, apiKey } = getConfig().reconsumet
  return createClient(url, {
    apiKey,
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)])
          : AbortSignal.timeout(TIMEOUT_MS),
      }),
  })
}

/** Next's data cache, matched to the API's own cache times; `false` = never cache. */
const cache = (revalidate: number | false): { init: RequestInit } => ({
  init: revalidate === false ? { cache: 'no-store' } : { next: { revalidate } },
})

async function call<T>(req: Promise<Response>): Promise<T> {
  let res: Response
  try {
    res = await req
  } catch (e) {
    throw new ReconsumetError('down', undefined, `reconsumet unreachable: ${(e as Error).message}`)
  }
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  const kind =
    res.status === 404 ? 'not_found' : res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'down' : 'bad_request'
  throw new ReconsumetError(kind, res.status, body?.error?.message)
}

export const reconsumet = {
  health: () => call<{ ok: boolean; version: string }>(api().v1.health.$get(undefined, cache(false))),
  search: (q: string, limit = 8) =>
    call<CatalogEntryT[]>(api().v1.search.$get({ query: { q, limit: String(limit) } }, cache(300))),
  // the API keeps finished shows 24 h and airing ones 1 h; 1 h here never serves staler data than that
  anime: (anilistId: number) =>
    call<AnimeT>(api().v1.anime[':anilistId'].$get({ param: { anilistId: String(anilistId) } }, cache(3600))),
  episodes: (anilistId: number, source?: string) =>
    call<EpisodesT>(
      api().v1.anime[':anilistId'].episodes.$get(
        { param: { anilistId: String(anilistId) }, query: source ? { source } : {} },
        cache(600),
      ),
    ),
  /** Never cached: links are sealed per request. `viewerIp` comes from clientIp() (trusted-proxy rules). */
  streams: (anilistId: number, episode: number, opts: { audio?: 'sub' | 'dub'; source?: string; viewerIp?: string }) =>
    call<StreamsT>(
      api().v1.anime[':anilistId'].episodes[':episode'].streams.$get(
        {
          param: { anilistId: String(anilistId), episode: String(episode) },
          query: {
            ...(opts.audio && { audio: opts.audio }),
            ...(opts.source && { source: opts.source }),
            ...(opts.viewerIp && { viewerIp: opts.viewerIp }),
          },
        },
        cache(false),
      ),
    ),
}
