import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Skeleton, SkeletonGroup } from '@/components/ui/card'
import { getConfig } from '@/config'
import { reconsumet } from '@/server/reconsumet'
import { type Result, SearchResults } from './results'

export const metadata: Metadata = { title: 'Search', robots: { index: false } }

type Props = { searchParams: Promise<{ q?: string }> }

export default async function SearchPage({ searchParams }: Props) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 100)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{q ? `Results for “${q}”` : 'Search'}</h1>
        {/* plain GET form: the query lives in the URL, so results are shareable and Back works */}
        {/* biome-ignore lint/a11y/useSemanticElements: <search> isn't announced by every screen reader yet */}
        <form role="search" action="/search" className="flex max-w-[640px] gap-2">
          <label htmlFor="search-q" className="sr-only">
            Search anime
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Title in English, romaji or Japanese"
            enterKeyHint="search"
            className="h-11 min-w-0 flex-1 rounded-md border border-line-2 bg-surface-1 px-3.5 text-fg placeholder:text-muted hover:border-line-3 focus-visible:border-fg"
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-fg px-5 font-semibold text-bg transition-transform duration-hover hover:-translate-y-px"
          >
            Search
          </button>
        </form>
      </div>
      {q ? (
        <Suspense key={q} fallback={<ResultsSkeleton />}>
          <Results q={q} />
        </Suspense>
      ) : (
        <p className="text-fg-3">Type a title above. Results show the type, year, episode count and status.</p>
      )}
    </div>
  )
}

async function Results({ q }: { q: string }) {
  const rows = await reconsumet.search(q, 50).catch(() => null)
  if (!rows)
    return (
      <div role="alert" className="rounded-lg border border-line-2 bg-surface-1 p-6 text-fg-2">
        <p className="font-semibold text-fg">Search is unavailable right now.</p>
        <p>
          Try again in a moment.{' '}
          <a href={`/search?q=${encodeURIComponent(q)}`} className="font-semibold text-fg underline">
            Retry
          </a>
        </p>
      </div>
    )
  const showAdult = getConfig().showAdult
  // isAdult absent = unknown (older catalog rows): those stay visible
  const results: Result[] = rows.flatMap((r) =>
    r.anilistId && (showAdult || r.isAdult !== true)
      ? [
          {
            id: r.anilistId,
            title: r.title,
            picture: r.picture,
            type: r.type,
            year: r.year,
            episodes: r.episodes,
            status: r.status,
          },
        ]
      : [],
  )
  return <SearchResults q={q} results={results} />
}

function ResultsSkeleton() {
  return (
    <SkeletonGroup label="Loading results" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </SkeletonGroup>
  )
}
