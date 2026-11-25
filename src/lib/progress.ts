// Watch-progress rules shared by the browser (guests, the player) and the server (signed-in writes).
import type { GuestData, Progress } from './guest'

/** An episode counts as watched at the outro's start or at 90 %, whichever comes first. */
export function completesAt(durationSec: number, outroStart?: number): number {
  const ninety = durationSec * 0.9
  return outroStart && outroStart > 0 && outroStart < ninety ? outroStart : ninety
}

export type Continue = { episode: number; positionSec: number; kind: 'start' | 'resume' | 'next' }

/**
 * What the Watch button plays: the most recently touched episode if it isn't finished, the one after it if it is
 * (when the source has it), else the first episode.
 */
export function continueTarget(progress: Progress[], episodes: number[]): Continue | null {
  if (!episodes.length) return null
  const sorted = [...episodes].sort((a, b) => a - b)
  const last = [...progress].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
  if (last && !last.completed && sorted.includes(last.episode))
    return { episode: last.episode, positionSec: last.positionSec, kind: 'resume' }
  if (last?.completed) {
    const next = sorted.find((n) => n > last.episode)
    if (next !== undefined) return { episode: next, positionSec: 0, kind: 'next' }
  }
  return { episode: sorted[0] as number, positionSec: 0, kind: 'start' }
}

/** Puts one progress row into guest storage (same rule as the merge: completed never goes back). */
export function putGuestProgress(d: GuestData, row: Progress): GuestData {
  const old = d.progress.find((p) => p.anilistId === row.anilistId && p.episode === row.episode)
  const rest = d.progress.filter((p) => p !== old)
  // newest first, so the 5000-row cap drops the oldest
  return { ...d, progress: [{ ...row, completed: row.completed || !!old?.completed }, ...rest].slice(0, 5000) }
}

/**
 * Server-side write throttle: at most one write per `minMs` per user/anime/episode, except that becoming completed
 * always goes through (so the watched state is never lost to the throttle).
 */
export function shouldWrite(
  last: { at: number; completed: boolean } | undefined,
  completed: boolean,
  now: number,
  minMs = 5000,
): boolean {
  return !last || now - last.at >= minMs || (completed && !last.completed)
}
