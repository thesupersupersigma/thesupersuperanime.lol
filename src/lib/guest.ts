// Guests keep watch progress, list entries and settings in localStorage, in the same shapes as the database tables
// (minus userId). On sign-in they are merged into the account (GuestMerge → mergeGuestData) and cleared locally.
import { z } from 'zod'

const date = z.iso.datetime()
const id = z.number().int().positive()

export const prefsSchema = z
  .object({
    autoplay: z.boolean(),
    autoskip: z.boolean(),
    audio: z.enum(['sub', 'dub']),
    subtitleSize: z.enum(['s', 'm', 'l', 'xl']),
    reducedMotion: z.enum(['system', 'reduce', 'full']),
    timeZone: z.string().max(64).nullable(),
  })
  .partial()
export type Prefs = z.infer<typeof prefsSchema>

export const guestSchema = z.object({
  progress: z
    .array(
      z.object({
        anilistId: id,
        episode: z.number().int().min(0).max(100_000),
        positionSec: z.number().min(0).max(1e6),
        durationSec: z.number().min(0).max(1e6),
        completed: z.boolean(),
        updatedAt: date,
      }),
    )
    .max(5000),
  list: z
    .array(
      z.object({
        anilistId: id,
        status: z.enum(['watching', 'planning', 'completed', 'paused', 'dropped']),
        score: z.number().int().min(0).max(100).nullable(),
        updatedAt: date,
      }),
    )
    .max(5000),
  settings: z.object({ prefs: prefsSchema, updatedAt: date }).nullable(),
})
export type GuestData = z.infer<typeof guestSchema>
export type Progress = GuestData['progress'][number]
export type ListItem = GuestData['list'][number]

const newer = (a: { updatedAt: string }, b: { updatedAt: string }) => Date.parse(a.updatedAt) > Date.parse(b.updatedAt)

/** Newest updatedAt wins per item; a completed episode never goes back to not completed. Returns only what changed. */
export function mergeGuest(
  account: { progress: Progress[]; list: ListItem[]; settings: GuestData['settings'] },
  guest: GuestData,
) {
  const pKey = (p: Progress) => `${p.anilistId}:${p.episode}`
  const have = new Map(account.progress.map((p) => [pKey(p), p]))
  const progress: Progress[] = []
  for (const g of guest.progress) {
    const a = have.get(pKey(g))
    if (!a) progress.push(g)
    else if (newer(g, a)) progress.push({ ...g, completed: g.completed || a.completed })
    else if (g.completed && !a.completed) progress.push({ ...a, completed: true })
  }
  const lists = new Map(account.list.map((l) => [l.anilistId, l]))
  const list = guest.list.filter((g) => {
    const a = lists.get(g.anilistId)
    return !a || newer(g, a)
  })
  // newer guest settings override key by key, so keys the guest never set keep the account's value
  const settings =
    guest.settings && (!account.settings || newer(guest.settings, account.settings))
      ? { prefs: { ...account.settings?.prefs, ...guest.settings.prefs }, updatedAt: guest.settings.updatedAt }
      : null
  return { progress, list, settings }
}

// ---- browser storage (client only)

const KEY = 'guest:v1'
export const emptyGuest = (): GuestData => ({ progress: [], list: [], settings: null })

export function readGuest(): GuestData {
  try {
    const r = guestSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    return r.success ? r.data : emptyGuest()
  } catch {
    return emptyGuest()
  }
}
export const writeGuest = (d: GuestData) => localStorage.setItem(KEY, JSON.stringify(d))
export const clearGuest = () => localStorage.removeItem(KEY)
export const hasGuestData = (d: GuestData) => d.progress.length > 0 || d.list.length > 0 || d.settings !== null
