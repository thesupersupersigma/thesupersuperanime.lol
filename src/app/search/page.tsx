import type { Metadata } from 'next'
import Link from 'next/link'
import { reconsumet } from '@/server/reconsumet'

// Stub until task 06 builds the real results page.
export const metadata: Metadata = { title: 'Search', robots: { index: false } }

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 200)
  const results = q ? await reconsumet.search(q, 30).catch(() => null) : []
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{q ? `Results for “${q}”` : 'Search'}</h1>
      {results === null && <p role="status">Search is unavailable right now. Try again in a moment.</p>}
      {results?.length === 0 && q && <p role="status">Nothing found. Try the Japanese (romaji) title.</p>}
      <ul className="flex flex-col gap-1">
        {results?.flatMap((r) =>
          r.anilistId
            ? [
                <li key={r.anilistId}>
                  <Link
                    href={`/anime/${r.anilistId}`}
                    className="flex min-h-11 items-center gap-3 rounded-sm px-2 hover:bg-surface-3"
                  >
                    <span className="font-semibold">{r.title}</span>
                    <span className="text-xs text-muted">{[r.type, r.year].filter(Boolean).join(' · ')}</span>
                  </Link>
                </li>,
              ]
            : [],
        )}
      </ul>
    </div>
  )
}
