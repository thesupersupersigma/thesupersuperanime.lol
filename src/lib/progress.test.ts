import { describe, expect, it } from 'vitest'
import type { Progress } from './guest'
import { completesAt, continueTarget, putGuestProgress, shouldWrite } from './progress'

const p = (episode: number, positionSec: number, completed: boolean, updatedAt: string): Progress => ({
  anilistId: 1,
  episode,
  positionSec,
  durationSec: 1440,
  completed,
  updatedAt,
})

describe('completesAt', () => {
  it('is the outro start when it comes before 90 %, else 90 %', () => {
    expect(completesAt(1440, 1250)).toBe(1250)
    expect(completesAt(1440, 1400)).toBeCloseTo(1296)
    expect(completesAt(1440)).toBeCloseTo(1296)
  })
})

describe('continueTarget', () => {
  const eps = [1, 2, 3]
  it('starts at the first episode with no progress', () => {
    expect(continueTarget([], eps)).toEqual({ episode: 1, positionSec: 0, kind: 'start' })
    expect(continueTarget([], [])).toBeNull()
  })
  it('resumes the newest unfinished episode', () => {
    const rows = [p(1, 0, true, '2026-01-01T00:00:00Z'), p(2, 500, false, '2026-01-02T00:00:00Z')]
    expect(continueTarget(rows, eps)).toEqual({ episode: 2, positionSec: 500, kind: 'resume' })
  })
  it('moves on after a finished episode, and back to the start after the last one', () => {
    expect(continueTarget([p(2, 1400, true, '2026-01-02T00:00:00Z')], eps)?.episode).toBe(3)
    expect(continueTarget([p(3, 1400, true, '2026-01-02T00:00:00Z')], eps)?.kind).toBe('start')
  })
})

describe('putGuestProgress', () => {
  it('replaces the row but never un-completes it', () => {
    const d = { progress: [p(1, 1400, true, '2026-01-01T00:00:00Z')], list: [], settings: null }
    const out = putGuestProgress(d, p(1, 10, false, '2026-01-02T00:00:00Z'))
    expect(out.progress).toHaveLength(1)
    expect(out.progress[0]).toMatchObject({ positionSec: 10, completed: true })
  })
})

describe('shouldWrite', () => {
  it('throttles to one write per 5 s unless the episode just became completed', () => {
    expect(shouldWrite(undefined, false, 0)).toBe(true)
    expect(shouldWrite({ at: 0, completed: false }, false, 4000)).toBe(false)
    expect(shouldWrite({ at: 0, completed: false }, true, 4000)).toBe(true)
    expect(shouldWrite({ at: 0, completed: true }, true, 4000)).toBe(false)
    expect(shouldWrite({ at: 0, completed: false }, false, 5000)).toBe(true)
  })
})
