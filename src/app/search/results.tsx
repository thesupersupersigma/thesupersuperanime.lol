'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { type Filters, filterResults, type Result } from './filter'

export type { Result }

const ALL = 'all'
const nice = (s: string) => (s.length <= 3 ? s : s.charAt(0) + s.slice(1).toLowerCase())
const NONE: Filters = { type: ALL, status: ALL, from: '', to: '', sort: 'relevance' }

/** The API only takes q + limit, so type/status/year filters and sorting run here, over the results we have. */
export function SearchResults({ q, results }: { q: string; results: Result[] }) {
  const [f, setF] = useState<Filters>(NONE)
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }))
  const shown = useMemo(() => filterResults(results, f), [results, f])
  const options = (key: 'type' | 'status', label: string) => [
    { value: ALL, label },
    ...[...new Set(results.map((r) => r[key]))].sort().map((v) => ({ value: v, label: nice(v) })),
  ]

  if (!results.length)
    return (
      <p role="status" className="rounded-lg border border-line-2 bg-surface-1 p-6 text-fg-2">
        Nothing found for “{q}”. Try the Japanese (romaji) title, or fewer words.
      </p>
    )

  const year = 'min-h-11 w-24 rounded-md border border-line-2 bg-surface-1 px-3 text-fg hover:border-line-3'
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="sr-only">Filter and sort</legend>
        <div className="w-40">
          <Select
            label="Type"
            value={f.type}
            onValueChange={(type) => set({ type })}
            options={options('type', 'All types')}
          />
        </div>
        <div className="w-40">
          <Select
            label="Status"
            value={f.status}
            onValueChange={(status) => set({ status })}
            options={options('status', 'Any status')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-2" aria-hidden>
            Years
          </span>
          <div className="flex items-center gap-2">
            <input
              aria-label="From year"
              inputMode="numeric"
              placeholder="From"
              value={f.from}
              onChange={(e) => set({ from: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className={year}
            />
            <span aria-hidden>–</span>
            <input
              aria-label="To year"
              inputMode="numeric"
              placeholder="To"
              value={f.to}
              onChange={(e) => set({ to: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className={year}
            />
          </div>
        </div>
        <div className="w-44">
          <Select
            label="Sort by"
            value={f.sort}
            onValueChange={(sort) => set({ sort: sort as Filters['sort'] })}
            options={[
              { value: 'relevance', label: 'Best match' },
              { value: 'year', label: 'Newest first' },
              { value: 'title', label: 'Title A–Z' },
            ]}
          />
        </div>
        {f !== NONE && (
          <Button variant="ghost" onClick={() => setF(NONE)}>
            Clear filters
          </Button>
        )}
      </fieldset>
      <p role="status" className="text-sm text-muted">
        {shown.length === results.length ? `${results.length} results` : `${shown.length} of ${results.length} results`}
      </p>
      {shown.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">
          {shown.map((r, i) => (
            <li key={r.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <Link href={`/anime/${r.id}`} className="group flex flex-col gap-2 rounded-lg">
                <span className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line-1 bg-surface-2">
                  {r.picture && (
                    <Image
                      src={r.picture}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 45vw, 200px"
                      className="object-cover transition-[transform,filter] duration-hover ease-out group-hover:scale-[1.03] group-hover:brightness-115"
                    />
                  )}
                </span>
                <span className="line-clamp-2 font-semibold">{r.title}</span>
                <span className="text-xs text-muted">
                  {[nice(r.type), r.year, r.episodes ? `${r.episodes} eps` : null, nice(r.status)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-3">No results match these filters.</p>
      )}
    </div>
  )
}
