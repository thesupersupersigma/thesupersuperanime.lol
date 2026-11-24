import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ReconsumetError, reconsumet } from '@/server/reconsumet'

// Stub until task 06 builds the real Anime page; keeps links from search and home working.
type Props = { params: Promise<{ id: string }> }

async function load(id: string) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) notFound()
  try {
    return await reconsumet.anime(n)
  } catch (e) {
    if (e instanceof ReconsumetError && e.kind === 'not_found') notFound()
    throw e
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await load((await params).id).catch(() => null)
  return { title: a?.title.english ?? a?.title.romaji ?? 'Anime' }
}

export default async function AnimePage({ params }: Props) {
  const a = await load((await params).id)
  return (
    <article className="flex animate-rise flex-wrap gap-8">
      <div className="relative aspect-[2/3] w-[200px] overflow-hidden rounded-lg border border-line-1 bg-surface-2">
        {a.coverImage?.large && <Image src={a.coverImage.large} alt="" fill sizes="200px" className="object-cover" />}
      </div>
      <div className="flex max-w-[60ch] flex-col gap-3">
        <h1 className="text-4xl font-extrabold">{a.title.english ?? a.title.romaji}</h1>
        {a.title.native && <p className="text-fg-3">{a.title.native}</p>}
        <p className="text-fg-2">
          {[a.format, a.seasonYear, a.episodes && `${a.episodes} episodes`, a.status].filter(Boolean).join(' · ')}
        </p>
        <p className="text-muted">The full page with episodes and the player is coming in the next update.</p>
      </div>
    </article>
  )
}
