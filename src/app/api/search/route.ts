import { NextResponse } from 'next/server'
import type { Suggestion } from '@/components/shell/search-box'
import { getConfig } from '@/config'
import { allowedImage } from '@/server/anime'
import { clientIp } from '@/server/client-ip'
import { limited } from '@/server/rate-limit'
import { reconsumet } from '@/server/reconsumet'

/** Header suggestions. The browser only talks to us; the API key stays on the server. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100)
  if (q.length < 2) return NextResponse.json([])
  const tooMany = limited('search', await clientIp())
  if (tooMany) return tooMany
  try {
    const rows = await reconsumet.search(q, 8)
    const showAdult = getConfig().showAdult
    const out: Suggestion[] = rows.flatMap((r) =>
      r.anilistId && (showAdult || r.isAdult !== true)
        ? [
            {
              anilistId: r.anilistId,
              title: r.title,
              picture: allowedImage(r.picture) ?? null,
              meta: [r.type, r.year, r.episodes && `${r.episodes} eps`].filter(Boolean).join(' · '),
            },
          ]
        : [],
    )
    return NextResponse.json(out, { headers: { 'cache-control': 'private, max-age=60' } })
  } catch {
    return NextResponse.json({ error: 'search_unavailable' }, { status: 502 })
  }
}
