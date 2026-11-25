import 'server-only'
import { headers } from 'next/headers'
import { z } from 'zod'
import { guestSchema, type ListItem, type Prefs, type Progress } from '@/lib/guest'
import { shouldWrite } from '@/lib/progress'
import { getAuth } from './auth'
import { getDb } from './db'

/** The signed-in user, or null (also when the database is down: pages then work as for a guest). */
export async function currentUser() {
  const s = await getAuth()
    .api.getSession({ headers: await headers() })
    .catch(() => null)
  return s?.user ?? null
}

const iso = (d: Date) => d.toISOString()

/** A signed-in user's progress rows, list entry and prefs for one anime (same shapes as guest storage). */
export async function userAnimeData(userId: string, anilistId: number) {
  const db = getDb()
  const [progress, list, settings] = await Promise.all([
    db.watchProgress.findMany({ where: { userId, anilistId } }),
    db.listEntry.findUnique({ where: { userId_anilistId: { userId, anilistId } } }),
    db.userSettings.findUnique({ where: { userId } }),
  ])
  return {
    progress: progress.map(({ id: _, userId: __, ...p }) => ({ ...p, updatedAt: iso(p.updatedAt) })) as Progress[],
    list: list && ({ ...list, status: list.status, updatedAt: iso(list.updatedAt) } as ListItem),
    prefs: (settings?.prefs ?? {}) as Prefs,
  }
}

export const progressInput = guestSchema.shape.progress.element.omit({ updatedAt: true })

// shortcut: per process, like the rate limits; one site process is the supported setup.
const lastWrite = new Map<string, { at: number; completed: boolean }>()

/** Upserts one progress row, at most every 5 s per episode; completed is never turned back off. */
export async function writeProgress(userId: string, input: unknown) {
  const p = progressInput.parse(input)
  const key = `${userId}:${p.anilistId}:${p.episode}`
  const now = Date.now()
  if (!shouldWrite(lastWrite.get(key), p.completed, now)) return { ok: true as const, skipped: true }
  lastWrite.set(key, { at: now, completed: p.completed || !!lastWrite.get(key)?.completed })
  if (lastWrite.size > 50_000) lastWrite.clear()
  const { anilistId, episode, ...row } = p
  const updatedAt = new Date(now)
  await getDb().watchProgress.upsert({
    where: { userId_anilistId_episode: { userId, anilistId, episode } },
    create: { userId, anilistId, episode, ...row, updatedAt },
    update: {
      positionSec: row.positionSec,
      durationSec: row.durationSec,
      updatedAt,
      ...(row.completed && { completed: true }),
    },
  })
  return { ok: true as const, skipped: false }
}

export const listInput = z.object({
  anilistId: z.number().int().positive(),
  status: guestSchema.shape.list.element.shape.status.nullable(),
  score: z.number().int().min(0).max(100).nullable(),
})

/** Sets (or with status null, removes) a list entry. */
export async function writeListEntry(userId: string, input: unknown) {
  const { anilistId, status, score } = listInput.parse(input)
  const db = getDb()
  const where = { userId_anilistId: { userId, anilistId } }
  if (!status) {
    await db.listEntry.deleteMany({ where: { userId, anilistId } })
    return
  }
  const row = { status, score, updatedAt: new Date() }
  await db.listEntry.upsert({ where, create: { userId, anilistId, ...row }, update: row })
}
