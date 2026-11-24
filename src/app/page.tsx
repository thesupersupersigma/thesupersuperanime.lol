import type { AnimeT } from '@reconsumet/client'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { Skeleton, SkeletonGroup } from '@/components/ui/card'
import { Waves } from '@/components/waves'
import { getConfig, publicConfig } from '@/config'
import { reconsumet } from '@/server/reconsumet'

// Placeholder home (task 05): the real Home page with spotlight, rows and schedule is task 06.
export default function Home() {
  const site = publicConfig()
  return (
    <div className="flex flex-col gap-11">
      <section className="relative flex min-h-[340px] overflow-hidden rounded-xl border border-line-1 bg-[#181818]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[170px] opacity-55">
          <Waves />
        </div>
        <div className="relative flex max-w-[640px] animate-rise flex-col justify-end gap-4 p-6 sm:p-11">
          <h1 className="text-4xl leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-[52px]">{site.name}</h1>
          <p className="max-w-[52ch] text-base text-fg-2">
            {site.description ?? 'Watch anime with your progress, lists and settings kept in sync.'}
          </p>
        </div>
      </section>
      <section aria-labelledby="picks" className="flex flex-col gap-4">
        <h2 id="picks" className="text-2xl font-bold">
          Picks
        </h2>
        <Suspense fallback={<PostersSkeleton n={getConfig().homeAnilistIds.length} />}>
          <Posters />
        </Suspense>
      </section>
    </div>
  )
}

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4'

async function Posters() {
  const ids = getConfig().homeAnilistIds
  const results = await Promise.allSettled(ids.map((id) => reconsumet.anime(id)))
  const shows = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (!shows.length)
    return (
      <div role="status" className="rounded-lg border border-line-2 bg-surface-1 p-6 text-fg-2">
        <p className="font-semibold text-fg">The anime library is taking a break.</p>
        <p>We can’t reach it right now. Refresh in a minute; your account and settings still work.</p>
      </div>
    )
  return (
    <ul className={grid}>
      {shows.map((a, i) => (
        <li key={a.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
          <PosterCard a={a} />
        </li>
      ))}
    </ul>
  )
}

const titleOf = (a: AnimeT) => a.title.english ?? a.title.romaji ?? a.title.native ?? `#${a.id}`

function PosterCard({ a }: { a: AnimeT }) {
  const title = titleOf(a)
  return (
    <Link href={`/anime/${a.id}`} className="group flex flex-col gap-2 rounded-lg">
      <span className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line-1 bg-surface-2">
        {a.coverImage?.large && (
          <Image
            src={a.coverImage.large}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className="object-cover transition-[transform,filter] duration-hover ease-out group-hover:scale-[1.03] group-hover:brightness-115"
          />
        )}
      </span>
      <span className="line-clamp-2 font-semibold">{title}</span>
      <span className="text-xs text-muted">
        {[a.format, a.seasonYear, a.episodes && `${a.episodes} eps`].filter(Boolean).join(' · ')}
      </span>
    </Link>
  )
}

function PostersSkeleton({ n }: { n: number }) {
  return (
    <SkeletonGroup label="Loading picks" className={grid}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </SkeletonGroup>
  )
}
