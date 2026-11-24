import { describe, expect, it } from 'vitest'
import { emptyGuest, guestSchema, mergeGuest, type Progress } from './guest'

const T1 = '2026-11-01T00:00:00.000Z'
const T2 = '2026-11-02T00:00:00.000Z'
const p = (o: Partial<Progress>): Progress => ({
  anilistId: 1,
  episode: 1,
  positionSec: 10,
  durationSec: 1400,
  completed: false,
  updatedAt: T1,
  ...o,
})

describe('mergeGuest', () => {
  it('adds what the account does not have', () => {
    const r = mergeGuest({ ...emptyGuest() }, { ...emptyGuest(), progress: [p({})] })
    expect(r.progress).toEqual([p({})])
  })

  it('newest updatedAt wins, older guest data is dropped', () => {
    const account = { ...emptyGuest(), progress: [p({ positionSec: 500, updatedAt: T2 })] }
    expect(
      mergeGuest(account, { ...emptyGuest(), progress: [p({ positionSec: 20, updatedAt: T1 })] }).progress,
    ).toEqual([])
    expect(
      mergeGuest(
        { ...emptyGuest(), progress: [p({ updatedAt: T1 })] },
        { ...emptyGuest(), progress: [p({ positionSec: 99, updatedAt: T2 })] },
      ).progress[0]?.positionSec,
    ).toBe(99)
  })

  it('never un-completes', () => {
    const done = { ...emptyGuest(), progress: [p({ completed: true, updatedAt: T1 })] }
    expect(
      mergeGuest(done, { ...emptyGuest(), progress: [p({ completed: false, updatedAt: T2 })] }).progress[0]?.completed,
    ).toBe(true)
    // older guest row that is completed still marks the account row completed
    const open = { ...emptyGuest(), progress: [p({ positionSec: 700, updatedAt: T2 })] }
    expect(mergeGuest(open, { ...emptyGuest(), progress: [p({ completed: true, updatedAt: T1 })] }).progress).toEqual([
      p({ positionSec: 700, updatedAt: T2, completed: true }),
    ])
  })

  it('merges list entries and settings by updatedAt', () => {
    const account = {
      progress: [],
      list: [{ anilistId: 5, status: 'watching' as const, score: null, updatedAt: T2 }],
      settings: { prefs: { autoplay: true }, updatedAt: T1 },
    }
    const r = mergeGuest(account, {
      progress: [],
      list: [
        { anilistId: 5, status: 'dropped', score: null, updatedAt: T1 },
        { anilistId: 6, status: 'planning', score: 80, updatedAt: T1 },
      ],
      settings: { prefs: { autoplay: false }, updatedAt: T2 },
    })
    expect(r.list.map((l) => l.anilistId)).toEqual([6])
    expect(r.settings?.prefs.autoplay).toBe(false)
  })

  it('rejects junk at the trust boundary', () => {
    expect(guestSchema.safeParse({ progress: [{ anilistId: -1 }], list: [], settings: null }).success).toBe(false)
  })
})
