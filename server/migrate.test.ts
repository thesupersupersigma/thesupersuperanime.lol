import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs (runs in the image without a build step)
import { checksum, plan } from './migrate.mjs'

const row = (migration_name: string, finished: boolean, rolledBack = false) => ({
  migration_name,
  finished_at: finished ? new Date() : null,
  rolled_back_at: rolledBack ? new Date() : null,
})

describe('plan', () => {
  it('applies the missing migrations in name order', () => {
    expect(plan(['20260102_b', '20260101_a', '20260103_c'], [row('20260101_a', true)])).toEqual({
      failed: null,
      pending: ['20260102_b', '20260103_c'],
    })
  })
  it('stops on a migration that started and never finished, like Prisma (P3009)', () => {
    expect(plan(['a', 'b'], [row('a', true), row('b', false)])).toEqual({ failed: 'b', pending: [] })
  })
  it('re-applies a migration that was marked rolled back', () => {
    expect(plan(['a'], [row('a', false, true)])).toEqual({ failed: null, pending: ['a'] })
  })
})

it("matches Prisma's checksum (SHA-256 of the file's bytes, as stored by prisma migrate deploy)", () => {
  const sql = readFileSync('prisma/migrations/20261124000000_init/migration.sql')
  expect(checksum(sql)).toBe('8c5f03cd8b1be6bb941efceeee46b3670b6999d215d68c8ebc570994440911e4')
})
