export type Result = {
  id: number
  title: string
  picture: string | null
  type: string
  year: number | null
  episodes: number
  status: string
}
export type Filters = { type: string; status: string; from: string; to: string; sort: 'relevance' | 'year' | 'title' }

/** 'all' means no filter; empty years mean open-ended; results keep the API's best-match order unless sorted. */
export function filterResults(rows: Result[], f: Filters): Result[] {
  const from = Number(f.from) || -Infinity
  const to = Number(f.to) || Infinity
  const out = rows.filter(
    (r) =>
      (f.type === 'all' || r.type === f.type) &&
      (f.status === 'all' || r.status === f.status) &&
      ((!f.from && !f.to) || (r.year !== null && r.year >= from && r.year <= to)),
  )
  if (f.sort === 'year') out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  if (f.sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}
