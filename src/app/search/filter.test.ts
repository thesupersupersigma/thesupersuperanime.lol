import { expect, it } from 'vitest'
import { filterResults, type Result } from './filter'

const r = (id: number, type: string, year: number | null, title: string): Result => ({
  id,
  title,
  type,
  year,
  picture: null,
  episodes: 12,
  status: 'FINISHED',
})
const rows = [r(1, 'TV', 2023, 'b'), r(2, 'MOVIE', 2016, 'a'), r(3, 'TV', null, 'c')]
const all = { type: 'all', status: 'all', from: '', to: '', sort: 'relevance' as const }

it('keeps best-match order and everything by default', () => {
  expect(filterResults(rows, all).map((x) => x.id)).toEqual([1, 2, 3])
})
it('filters by type and an open-ended year range (unknown years drop out only when a range is set)', () => {
  expect(filterResults(rows, { ...all, type: 'TV' }).map((x) => x.id)).toEqual([1, 3])
  expect(filterResults(rows, { ...all, from: '2020' }).map((x) => x.id)).toEqual([1])
  expect(filterResults(rows, { ...all, to: '2020' }).map((x) => x.id)).toEqual([2])
})
it('sorts by year (newest first) and by title', () => {
  expect(filterResults(rows, { ...all, sort: 'year' }).map((x) => x.id)).toEqual([1, 2, 3])
  expect(filterResults(rows, { ...all, sort: 'title' }).map((x) => x.id)).toEqual([2, 1, 3])
})
