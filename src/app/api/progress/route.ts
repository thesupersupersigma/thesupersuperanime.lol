import { getConfig } from '@/config'
import { currentUser, writeProgress } from '@/server/user-data'

/**
 * navigator.sendBeacon target for the last save when the page is hidden (server actions can't be beaconed).
 * Same-origin only: the Origin must be the site, and the session cookie is SameSite=Lax anyway.
 */
export async function POST(req: Request) {
  if (req.headers.get('origin') !== getConfig().site.url) return new Response(null, { status: 403 })
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null)
  try {
    await writeProgress(user.id, body)
  } catch {
    return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 204 })
}
