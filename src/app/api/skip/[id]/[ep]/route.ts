import { NextResponse } from 'next/server'
import { clientIp } from '@/server/client-ip'
import { limited } from '@/server/rate-limit'
import { reconsumet } from '@/server/reconsumet'

type Ctx = { params: Promise<{ id: string; ep: string }> }

/** AniSkip times for the stream the viewer is playing (`duration` = its real length). Any failure = no times. */
export async function GET(req: Request, { params }: Ctx) {
  const { id: rawId, ep: rawEp } = await params
  const id = Number(rawId)
  const ep = Number(rawEp)
  const duration = Number(new URL(req.url).searchParams.get('duration'))
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(ep) || ep < 0 || !(duration > 0 && duration < 36_000))
    return NextResponse.json({}, { status: 400 })
  const tooMany = limited('streams', await clientIp())
  if (tooMany) return tooMany
  const s = await reconsumet.skip(id, ep, duration).catch(() => null)
  const body = s?.source === 'aniskip' ? { intro: s.intro, outro: s.outro } : {}
  return NextResponse.json(body, { headers: { 'cache-control': 'private, max-age=3600' } })
}
