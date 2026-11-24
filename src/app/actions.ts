'use server'
import { cookies, headers } from 'next/headers'
import { guestSchema, mergeGuest, type Prefs, prefsSchema } from '@/lib/guest'
import { getAuth } from '@/server/auth'
import { getDb } from '@/server/db'

const session = async () => getAuth().api.getSession({ headers: await headers() })
const iso = (d: Date) => d.toISOString()

/** Moves a guest's localStorage data into the signed-in account (rules in mergeGuest). */
export async function mergeGuestData(input: unknown) {
  const s = await session()
  if (!s) return { ok: false as const }
  const data = guestSchema.parse(input)
  const userId = s.user.id
  const db = getDb()
  const ids = [...new Set([...data.progress, ...data.list].map((x) => x.anilistId))]
  const [progress, list, settings] = await Promise.all([
    db.watchProgress.findMany({ where: { userId, anilistId: { in: ids } } }),
    db.listEntry.findMany({ where: { userId, anilistId: { in: ids } } }),
    db.userSettings.findUnique({ where: { userId } }),
  ])
  const m = mergeGuest(
    {
      progress: progress.map((p) => ({ ...p, updatedAt: iso(p.updatedAt) })),
      list: list.map((l) => ({ ...l, status: l.status as never, updatedAt: iso(l.updatedAt) })),
      settings: settings && { prefs: settings.prefs as Prefs, updatedAt: iso(settings.updatedAt) },
    },
    data,
  )
  await db.$transaction([
    ...m.progress.map(({ anilistId, episode, ...p }) => {
      const row = { ...p, updatedAt: new Date(p.updatedAt) }
      return db.watchProgress.upsert({
        where: { userId_anilistId_episode: { userId, anilistId, episode } },
        create: { userId, anilistId, episode, ...row },
        update: row,
      })
    }),
    ...m.list.map(({ anilistId, ...l }) => {
      const row = { ...l, updatedAt: new Date(l.updatedAt) }
      return db.listEntry.upsert({
        where: { userId_anilistId: { userId, anilistId } },
        create: { userId, anilistId, ...row },
        update: row,
      })
    }),
    ...(m.settings
      ? [
          db.userSettings.upsert({
            where: { userId },
            create: { userId, prefs: m.settings.prefs, updatedAt: new Date(m.settings.updatedAt) },
            update: { prefs: m.settings.prefs, updatedAt: new Date(m.settings.updatedAt) },
          }),
        ]
      : []),
  ])
  if (m.settings?.prefs.reducedMotion) await setMotionCookie(m.settings.prefs.reducedMotion)
  return { ok: true as const, progress: m.progress.length, list: m.list.length }
}

async function setMotionCookie(v: NonNullable<Prefs['reducedMotion']>) {
  ;(await cookies()).set('motion', v, { path: '/', maxAge: 60 * 60 * 24 * 400, sameSite: 'lax' })
}

/** Saves preferences: to the account when signed in (guests keep them in localStorage), and the motion cookie. */
export async function savePrefs(input: unknown) {
  const prefs = prefsSchema.parse(input)
  if (prefs.reducedMotion) await setMotionCookie(prefs.reducedMotion)
  const s = await session()
  if (!s) return
  const db = getDb()
  const old = await db.userSettings.findUnique({ where: { userId: s.user.id } })
  const merged = { ...(old?.prefs as Prefs | undefined), ...prefs }
  await db.userSettings.upsert({
    where: { userId: s.user.id },
    create: { userId: s.user.id, prefs: merged, updatedAt: new Date() },
    update: { prefs: merged, updatedAt: new Date() },
  })
}
