import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EpisodeList } from '@/components/anime/episode-list'
import { Unavailable } from '@/components/anime/unavailable'
import { UserAnimeProvider } from '@/components/anime/user-state'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button'
import { WatchClient } from '@/components/watch/watch-client'
import { titleLangOf, titleOf } from '@/lib/title'
import { allowedImage, loadAnime, loadAvailability, maxEpisode } from '@/server/anime'
import { currentUser, userAnimeData } from '@/server/user-data'

type Props = { params: Promise<{ id: string; ep: string }> }

const parse = async (params: Props['params']) => {
  const p = await params
  const id = Number(p.id)
  const ep = Number(p.ep)
  return Number.isInteger(id) && id > 0 && id < 2 ** 31 && Number.isInteger(ep) && ep >= 0 && ep < 100_000
    ? { id, ep }
    : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await parse(params)
  const r = p ? await loadAnime(p.id) : null
  if (!p || !r || !('anime' in r)) return { title: 'Watch' }
  const title = titleOf(r.anime.title, titleLangOf((await cookies()).get('title')?.value))
  const image = r.anime.coverImage.extraLarge ?? r.anime.coverImage.large
  return {
    title: `Episode ${p.ep} · ${title}`,
    openGraph: { title: `${title} · Episode ${p.ep}`, ...(image && { images: [image] }) },
  }
}

export default async function WatchPage({ params }: Props) {
  const p = await parse(params)
  if (!p) notFound()
  const { id, ep } = p
  const [r, avail, user, jar] = await Promise.all([loadAnime(id), loadAvailability(id), currentUser(), cookies()])
  if ('error' in r) {
    if (r.error === 'not_found') notFound()
    return <Unavailable busy={r.error === 'busy'} retry={`/watch/${id}/${ep}`} />
  }
  const a = r.anime
  const title = titleOf(a.title, titleLangOf(jar.get('title')?.value))
  const episode = avail.episodes.find((e) => e.number === ep)
  const max = maxEpisode(a)
  if (!episode && (ep < 1 || (max !== null && ep > max))) notFound()

  const back = (
    <Link href={`/anime/${id}`} className={buttonClass('secondary', 'self-start')}>
      Back to {title}
    </Link>
  )
  if (!episode)
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-[560px] flex-col gap-3 rounded-lg border border-line-2 bg-surface-1 p-6"
      >
        <h1 className="text-2xl font-bold">
          Episode {ep} isn’t on our sources {avail.down ? 'right now' : 'yet'}
        </h1>
        <p className="text-fg-2">
          {avail.down
            ? 'We can’t reach the episode list at the moment. Try again in a minute.'
            : avail.episodes.length
              ? `They have episodes ${avail.episodes[0]?.number}–${avail.episodes.at(-1)?.number} of this show. New episodes usually show up a few hours after they air.`
              : 'None of our sources has this show yet.'}
        </p>
        {back}
      </div>
    )

  const mine = user ? await userAnimeData(user.id, id).catch(() => null) : null
  const cover = allowedImage(a.coverImage.large)
  const numbers = avail.episodes.map((e) => e.number)
  const i = numbers.indexOf(ep)

  return (
    <UserAnimeProvider
      anilistId={id}
      signedIn={!!user}
      initial={{ progress: mine?.progress ?? [], list: mine?.list ?? null }}
    >
      <WatchClient
        key={ep}
        anilistId={id}
        episode={ep}
        episodeTitle={episode.title}
        title={title}
        poster={allowedImage(a.bannerImage) ?? cover}
        prev={i > 0 ? numbers[i - 1] : undefined}
        next={i >= 0 && i < numbers.length - 1 ? numbers[i + 1] : undefined}
        hasDub={episode.dub}
        signedIn={!!user}
        accountPrefs={mine?.prefs ?? null}
        sidebar={
          <>
            <section
              aria-labelledby="eps"
              className="flex flex-col gap-3 rounded-[16px] border border-line-1 bg-surface-1 p-4"
            >
              <h2 id="eps" className="text-lg font-bold">
                Episodes
              </h2>
              <EpisodeList anilistId={id} episodes={avail.episodes} current={ep} compact />
            </section>
            <section
              aria-labelledby="about"
              className="flex flex-col gap-3 rounded-[16px] border border-line-1 bg-surface-1 p-4"
            >
              <div className="flex gap-3.5">
                <span className="relative h-[100px] w-[72px] flex-none overflow-hidden rounded-[10px] bg-surface-3">
                  {cover && <Image src={cover} alt="" fill sizes="72px" className="object-cover" />}
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h2 id="about" className="text-base leading-tight font-bold">
                    {title}
                  </h2>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {avail.episodes.some((e) => e.sub) && (
                      <Badge kind="sub">SUB {avail.episodes.filter((e) => e.sub).length}</Badge>
                    )}
                    {avail.episodes.some((e) => e.dub) && (
                      <Badge kind="dub">DUB {avail.episodes.filter((e) => e.dub).length}</Badge>
                    )}
                    <span className="text-muted">
                      {[a.format, a.duration && `${a.duration}m`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {a.genres.length > 0 && <span className="text-xs text-fg-3">{a.genres.slice(0, 4).join(' · ')}</span>}
                </div>
              </div>
              <Link href={`/anime/${id}`} className={buttonClass('secondary', 'min-h-10 text-[13px]')}>
                View details
              </Link>
            </section>
          </>
        }
      />
    </UserAnimeProvider>
  )
}
