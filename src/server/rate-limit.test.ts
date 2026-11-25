import { expect, it } from 'vitest'
import { hit } from './rate-limit'

it('allows `limit` hits per window, then says how long to wait, then resets', () => {
  const t = 1_000_000
  for (let i = 0; i < 3; i++) expect(hit('a', 3, 60_000, t + i)).toBe(0)
  expect(hit('a', 3, 60_000, t + 30_000)).toBe(30)
  expect(hit('b', 3, 60_000, t + 30_000)).toBe(0) // other keys are separate
  expect(hit('a', 3, 60_000, t + 60_000)).toBe(0)
})
