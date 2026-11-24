import { getDb } from '@/server/db'
import { reconsumet } from '@/server/reconsumet'
import pkg from '../../../../package.json'

/**
 * 200 while the site can serve pages (database up); 503 otherwise. RECONSUMET.TS being down doesn't fail the
 * container healthcheck — pages show a friendly state — but `ok` is false so monitoring sees it.
 */
export async function GET() {
  const [db, api] = await Promise.allSettled([getDb().$queryRaw`SELECT 1`, reconsumet.health()])
  const body = {
    ok: db.status === 'fulfilled' && api.status === 'fulfilled',
    version: pkg.version,
    database: { ok: db.status === 'fulfilled' },
    reconsumet: api.status === 'fulfilled' ? { ok: true, version: api.value.version } : { ok: false },
  }
  return Response.json(body, { status: body.database.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } })
}
