import { NextResponse } from 'next/server'
import type { Server } from '@/lib/watch'
import { clientIp } from '@/server/client-ip'
import { limited } from '@/server/rate-limit'
import { reconsumet } from '@/server/reconsumet'

type Ctx = { params: Promise<{ id: string; ep: string }> }

/**
 * Every server for one episode, across the sources that have it and both audios they offer, in the API's source
 * order. Called server-side with the viewer's IP so the relay links work only for them; the browser only ever sees
 * relay URLs. Never cached (links are sealed per request).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id: rawId, ep: rawEp } = await params
  const id = Number(rawId)
  const ep = Number(rawEp)
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(ep) || ep < 0)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const ip = await clientIp()
  const tooMany = limited('streams', ip)
  if (tooMany) return tooMany

  const sources = await reconsumet.sources().catch(() => null)
  if (!sources) return NextResponse.json({ error: 'down' }, { status: 502 })
  // which source has this episode, and in which audio (episode lists are cached for 10 minutes)
  const has = await Promise.all(
    sources.map((s) =>
      reconsumet
        .episodes(id, s.id)
        .then((r) => r.episodes.find((e) => e.number === ep))
        .catch(() => undefined),
    ),
  )
  const asks = sources.flatMap((s, i) => {
    const e = has[i]
    if (!e) return []
    const audios: ('sub' | 'dub')[] = []
    if (e.sub ?? !e.dub) audios.push('sub')
    if (e.dub) audios.push('dub')
    return audios.map((audio) => ({ source: s, audio }))
  })
  if (!asks.length) return NextResponse.json({ error: 'no_episode' }, { status: 404 })

  const answers = await Promise.allSettled(
    asks.map(({ source, audio }) =>
      reconsumet.streams(id, ep, { source: source.id, audio, viewerIp: ip ?? undefined }).then((r) => ({ r, source })),
    ),
  )
  const servers: Server[] = []
  let expiresAt = Number.POSITIVE_INFINITY
  for (const a of answers) {
    if (a.status !== 'fulfilled') continue
    const { r, source } = a.value
    expiresAt = Math.min(expiresAt, Date.parse(r.expiresAt))
    for (const s of r.servers) {
      const stream = s.streams.find((x) => x.type === 'hls') ?? s.streams[0]
      if (!stream) continue
      servers.push({
        key: `${source.id}:${r.audio}:${s.name}`,
        source: source.name,
        audio: r.audio,
        name: s.name,
        url: stream.url,
        type: stream.type,
        intro: s.intro,
        outro: s.outro,
        subtitles: s.subtitles,
      })
    }
  }
  if (!servers.length) return NextResponse.json({ error: 'no_streams' }, { status: 502 })
  return NextResponse.json(
    { expiresAt: new Date(expiresAt).toISOString(), servers },
    { headers: { 'cache-control': 'no-store' } },
  )
}
