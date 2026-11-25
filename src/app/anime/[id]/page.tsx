import type { AnimeT } from '@reconsumet/client'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EpisodeList } from '@/components/anime/episode-list'
import { AnimeActions, Description, NextEpisode, PosterTilt, Rating } from '@/components/anime/hero'
import { Unavailable } from '@/components/anime/unavailable'
import { UserAnimeProvider } from '@/components/anime/user-state'
import { Badge } from '@/components/ui/badge'
import { Tab, Tabs, TabsContent, TabsList } from '@/components/ui/tabs'
import { getConfig } from '@/config'
import { cx } from '@/lib/cx'
import { titleLangOf, titleOf } from '@/lib/title'
import { allowedImage, loadAnime, loadAvailability, type SourceInfo } from '@/server/anime'
import { sanitizeDescription } from '@/server/sanitize'
import { currentUser, userAnimeData } from '@/server/user-data'

type Props = { params: Promise<{ id: string }> }

const idOf = (raw: string) => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idOf((await params).id)
  const r = id ? await loadAnime(id) : null
  if (!r || !('anime' in r)) return { title: 'Anime' }
  const a = r.anime
  const title = titleOf(a.title, titleLangOf((await cookies()).get('title')?.value))
  const description = a.description
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  const image = a.coverImage.extraLarge ?? a.coverImage.large
  return {
    title,
    description,
    openGraph: { title, description, type: 'video.tv_show', ...(image && { images: [image] }) },
  }
}

const nice = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : null)
// AniList formats: acronyms stay upper case (TV, OVA, ONA), the rest read as words
const fmt = (f: string | null | undefined) =>
  f && /^(TV|OVA|ONA)$/.test(f) ? f : f === 'TV_SHORT' ? 'TV short' : nice(f)
const STATUS: Record<string, string> = {
  FINISHED: 'Finished',
  RELEASING: 'Airing',
  NOT_YET_RELEASED: 'Upcoming',
  CANCELLED: 'Cancelled',
  HIATUS: 'On hiatus',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const date = (d: { year: number | null; month: number | null }) =>
  d.year ? `${d.month ? `${MONTHS[d.month - 1]} ` : ''}${d.year}` : null

export default async function AnimePage({ params }: Props) {
  const id = idOf((await params).id)
  if (!id) notFound()
  const [r, avail, user, jar] = await Promise.all([loadAnime(id), loadAvailability(id), currentUser(), cookies()])
  if ('error' in r) {
    if (r.error === 'not_found') notFound()
    return <Unavailable busy={r.error === 'busy'} retry={`/anime/${id}`} />
  }
  const a = r.anime
  const lang = titleLangOf(jar.get('title')?.value)
  const title = titleOf(a.title, lang)
  const others = [a.title.romaji, a.title.english, a.title.native].filter((t) => t && t !== title)
  const mine = user ? await userAnimeData(user.id, id).catch(() => null) : null
  const cover = allowedImage(a.coverImage.extraLarge ?? a.coverImage.large)
  const banner = allowedImage(a.bannerImage)
  const description = sanitizeDescription(a.description)
  const showAdult = getConfig().showAdult
  const tags = a.tags.filter((t) => !t.isSpoiler && (showAdult || !t.isAdult)).slice(0, 12)
  const subs = avail.episodes.filter((e) => e.sub).length
  const dubs = avail.episodes.filter((e) => e.dub).length
  const studio = a.studios.find((s) => s.isMain && s.isAnimationStudio) ?? a.studios[0]

  return (
    <UserAnimeProvider
      anilistId={id}
      signedIn={!!user}
      initial={{ progress: mine?.progress ?? [], list: mine?.list ?? null }}
    >
      <div className="relative -mx-4 -mt-6 h-[260px] overflow-hidden bg-surface-2 sm:-mx-8 sm:h-[320px]">
        {(banner ?? cover) && (
          <Image
            src={(banner ?? cover) as string}
            alt=""
            fill
            priority
            sizes="100vw"
            className={cx('object-cover', !banner && 'scale-110 opacity-60 blur-2xl')}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgb(14_14_14/0.55)_0%,rgb(14_14_14/0.2)_35%,#0e0e0e_100%)]"
        />
      </div>

      <div className="relative -mt-[170px] flex flex-col gap-9 sm:-mt-[190px]">
        <nav
          aria-label="Breadcrumb"
          className="flex gap-2 text-[13px] text-fg-2 [text-shadow:0_1px_4px_rgb(0_0_0/0.9)]"
        >
          <Link href="/" className="font-semibold hover:text-fg">
            Home
          </Link>
          <span aria-hidden>/</span>
          <span aria-current="page" className="truncate text-fg">
            {title}
          </span>
        </nav>

        <section className="flex flex-wrap items-end gap-6 sm:gap-9">
          <PosterTilt src={cover} alt={`${title} poster`} />
          <div className="flex min-w-0 flex-[999_1_480px] animate-rise flex-col gap-3.5">
            <div className="flex flex-wrap gap-2">
              {a.status && (
                <span className="inline-flex min-h-7 items-center rounded-full border border-line-3 px-2.5 text-xs font-semibold text-[#d9d9d9]">
                  {STATUS[a.status] ?? nice(a.status)}
                </span>
              )}
              {a.nextAiringEpisode && <NextEpisode {...a.nextAiringEpisode} />}
            </div>
            <h1 className="text-[34px] leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-[50px]">{title}</h1>
            {others.length > 0 && <p className="text-fg-3">{others.join(' · ')}</p>}
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
              {[
                fmt(a.format),
                a.season && a.seasonYear ? `${nice(a.season)} ${a.seasonYear}` : a.seasonYear,
                a.episodes ? `${a.episodes} eps${a.duration ? ` · ${a.duration}m` : ''}` : null,
                studio?.name,
              ]
                .filter(Boolean)
                .map((x) => (
                  <span key={String(x)} className="rounded-[7px] border border-line-3 px-2 py-1">
                    {x}
                  </span>
                ))}
              {subs > 0 && <Badge kind="sub">SUB {subs}</Badge>}
              {dubs > 0 && <Badge kind="dub">DUB {dubs}</Badge>}
            </div>
            <div className="mt-1.5">
              <AnimeActions
                id={id}
                episodes={avail.episodes.map((e) => e.number)}
                trailer={
                  a.trailer?.id && (a.trailer.site === 'youtube' || a.trailer.site === 'dailymotion')
                    ? { site: a.trailer.site, id: a.trailer.id }
                    : null
                }
              />
            </div>
          </div>
          <div className="grid max-w-[460px] flex-[1_1_280px] grid-cols-2 gap-2.5">
            <Stat label="AniList">{a.averageScore ? `${a.averageScore}%` : '–'}</Stat>
            <Stat label="Favourites">
              {a.favourites ? Intl.NumberFormat('en', { notation: 'compact' }).format(a.favourites) : '–'}
            </Stat>
            <div className="col-span-2 flex items-center justify-between gap-1.5 rounded-lg border border-line-1 bg-surface-1 py-1.5 pr-1.5 pl-3.5">
              <span className="text-xs text-muted">Your rating</span>
              <Rating />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-8">
          <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">
            {description && <Description html={description} />}
            {(a.genres.length > 0 || tags.length > 0) && (
              <ul aria-label="Genres and tags" className="flex flex-wrap gap-2">
                {a.genres.map((g) => (
                  <li
                    key={g}
                    className="rounded-full border border-line-2 bg-surface-1 px-3.5 py-2 text-[13px] text-fg-2"
                  >
                    {g}
                  </li>
                ))}
                {tags.map((t) => (
                  <li
                    key={t.name}
                    className="rounded-full border border-dashed border-line-2 px-3.5 py-2 text-[13px] text-muted"
                  >
                    {t.name}
                  </li>
                ))}
              </ul>
            )}
            <Tabs defaultValue="episodes" className="mt-2 flex flex-col gap-4">
              <TabsList className="w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-line-1 bg-transparent p-0">
                {['Episodes', 'Characters', 'Watch order'].map((t) => (
                  <Tab
                    key={t}
                    value={t.toLowerCase().replace(' ', '-')}
                    className="-mb-px rounded-none border-b-2 border-transparent data-[state=active]:border-fg data-[state=active]:bg-transparent"
                  >
                    {t}
                  </Tab>
                ))}
              </TabsList>
              <TabsContent value="episodes" className="animate-pop">
                {avail.episodes.length ? (
                  <EpisodeList anilistId={id} episodes={avail.episodes} fallbackThumb={banner ?? cover} />
                ) : (
                  <p role="status" className="rounded-lg border border-line-2 bg-surface-1 p-5 text-fg-2">
                    {avail.down
                      ? 'Episodes can’t be loaded right now. Refresh in a minute.'
                      : a.status === 'NOT_YET_RELEASED'
                        ? 'This hasn’t started airing yet.'
                        : 'None of our sources has this show yet.'}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="characters" className="animate-pop">
                <Characters a={a} />
              </TabsContent>
              <TabsContent value="watch-order" className="animate-pop">
                <WatchOrder a={a} title={title} lang={lang} />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="flex max-w-[420px] min-w-0 flex-[1_1_320px] flex-col gap-5">
            <Details a={a} sources={avail.sources} />
          </aside>
        </div>

        {a.recommendations.length > 0 && (
          <section aria-labelledby="recs" className="flex flex-col gap-3.5">
            <h2 id="recs" className="text-2xl font-bold">
              If you liked this
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-5">
              {a.recommendations.map((x, i) => {
                const img = allowedImage(x.coverImage?.large)
                return (
                  <li key={x.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                    <Link href={`/anime/${x.id}`} className="group flex flex-col gap-2">
                      <span className="relative aspect-[2/3] overflow-hidden rounded-[12px] border border-line-1 bg-surface-2">
                        {img && (
                          <Image
                            src={img}
                            alt=""
                            fill
                            sizes="200px"
                            className="object-cover transition-[transform,filter] duration-hover group-hover:scale-[1.03] group-hover:brightness-115"
                          />
                        )}
                      </span>
                      <span className="line-clamp-2 text-[13px] font-semibold">{titleOf(x.title, lang)}</span>
                      <span className="text-xs text-muted">
                        {[fmt(x.format), x.episodes && `${x.episodes} eps`, x.averageScore && `${x.averageScore}%`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </UserAnimeProvider>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line-1 bg-surface-1 p-3.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-display text-[22px] font-extrabold sm:text-[26px]">{children}</span>
    </div>
  )
}

function Details({ a, sources }: { a: AnimeT; sources: SourceInfo[] }) {
  const aired = [date(a.startDate), a.status === 'RELEASING' ? 'now' : date(a.endDate)].filter(Boolean)
  const rows: [string, React.ReactNode][] = [
    ['Format', fmt(a.format)],
    ['Episodes', a.episodes ? `${a.episodes}${a.duration ? ` × ${a.duration} min` : ''}` : null],
    ['Status', a.status && (STATUS[a.status] ?? nice(a.status))],
    ['Aired', aired.length ? aired.join(' – ') : null],
    ['Season', a.season && a.seasonYear ? `${nice(a.season)} ${a.seasonYear}` : null],
    [
      'Studios',
      a.studios
        .filter((s) => s.isAnimationStudio)
        .map((s) => s.name)
        .join(', ') || null,
    ],
    ['Source', nice(a.source)],
  ]
  // third-party URLs: only http(s) ones become links
  const legal = a.externalLinks.flatMap((l) =>
    l.url && /^https?:\/\//.test(l.url) && (l.type === 'STREAMING' || (l.type === 'INFO' && l.site === 'Official Site'))
      ? [{ site: l.site, url: l.url }]
      : [],
  )
  return (
    <section aria-labelledby="det" className="flex flex-col rounded-[16px] border border-line-1 bg-surface-1 p-[18px]">
      <h2 id="det" className="mb-2 text-lg font-bold">
        Details
      </h2>
      <dl className="flex flex-col">
        {rows.flatMap(([k, v]) =>
          v
            ? [
                <div key={k} className="flex justify-between gap-3 border-t border-line-1 py-2 text-[13px]">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>,
              ]
            : [],
        )}
        <div className="flex justify-between gap-3 border-t border-line-1 py-2 text-[13px]">
          <dt className="text-muted">Available on</dt>
          <dd className="text-right">
            {sources.length ? (
              <ul className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                {sources.map((s) => (
                  <li key={s.id} className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cx(
                        'size-2 rounded-full',
                        s.healthy === false ? 'bg-muted/50 ring-1 ring-muted' : 'bg-fg',
                      )}
                    />
                    {s.name} ✓
                    <span className="sr-only">
                      {s.healthy === false
                        ? '(having problems right now)'
                        : s.healthy
                          ? '(working)'
                          : '(not checked yet)'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              'No source yet'
            )}
          </dd>
        </div>
      </dl>
      {legal.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line-1 pt-3">
          <h3 className="font-sans text-[13px] font-semibold text-fg-2">Watch legally</h3>
          <ul className="flex flex-wrap gap-2">
            {legal.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center rounded-sm border border-line-2 px-3 text-[13px] hover:bg-surface-3"
                >
                  {l.site}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Characters({ a }: { a: AnimeT }) {
  if (!a.characters.length) return <p className="text-fg-3">No characters listed on AniList.</p>
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
      {a.characters.map((c) => {
        const va = c.voiceActor ?? c.voiceActorEnglish
        const vaImg = allowedImage(va?.image)
        const img = allowedImage(c.image)
        return (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-[12px] border border-line-1 bg-surface-1 p-2.5"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="relative size-12 flex-none overflow-hidden rounded-full bg-surface-3">
                {img && <Image src={img} alt="" fill sizes="48px" className="object-cover" />}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold">{c.name}</span>
                <span className="text-xs text-muted">{nice(c.role)}</span>
              </span>
            </span>
            {va && (
              <span className="flex min-w-0 items-center gap-2.5 text-right">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13px]">{va.name}</span>
                  <span className="text-xs text-muted">{c.voiceActor ? 'Japanese' : 'English'}</span>
                </span>
                <span className="relative size-10 flex-none overflow-hidden rounded-full bg-surface-3">
                  {vaImg && <Image src={vaImg} alt="" fill sizes="40px" className="object-cover" />}
                </span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const RELATED = new Set([
  'PREQUEL',
  'SEQUEL',
  'PARENT',
  'SIDE_STORY',
  'SPIN_OFF',
  'ALTERNATIVE',
  'SUMMARY',
  'COMPILATION',
])

/** This show plus its direct relations (AniList gives one hop), oldest first; undated ones go last. */
function WatchOrder({ a, title, lang }: { a: AnimeT; title: string; lang: ReturnType<typeof titleLangOf> }) {
  const items = [
    {
      id: a.id,
      kind: 'You are here',
      title,
      year: a.seasonYear,
      format: a.format,
      episodes: a.episodes,
      img: allowedImage(a.coverImage.large),
      here: true,
    },
    ...a.relations.edges
      .filter((e) => e.node.type === 'ANIME' && RELATED.has(e.relationType))
      .map((e) => ({
        id: e.node.id,
        kind: nice(e.relationType) as string,
        title: titleOf(e.node.title, lang),
        year: e.node.seasonYear,
        format: e.node.format,
        episodes: e.node.episodes,
        img: allowedImage(e.node.coverImage?.large),
        here: false,
      })),
  ].sort((x, y) => (x.year ?? 9999) - (y.year ?? 9999))
  if (items.length === 1) return <p className="text-fg-3">No sequels, prequels or side stories on AniList.</p>
  return (
    <ol className="flex flex-col pl-1">
      {items.map((x) => (
        <li key={x.id} className="flex gap-4">
          <span aria-hidden className="flex flex-col items-center">
            <span className={cx('mt-[18px] size-3.5 rounded-full border-2 border-fg', x.here ? 'bg-fg' : 'bg-bg')} />
            <span className="w-0.5 flex-1 bg-[#2a2a2a]" />
          </span>
          {/* the current show isn't a link: it's this page */}
          {(() => {
            const body = (
              <>
                <span className="relative h-[70px] w-[50px] flex-none overflow-hidden rounded-sm bg-surface-3">
                  {x.img && <Image src={x.img} alt="" fill sizes="50px" className="object-cover" />}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">{x.kind}</span>
                  <span className="font-semibold">{x.title}</span>
                  <span className="text-xs text-muted">
                    {[fmt(x.format), x.year, x.episodes && `${x.episodes} eps`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </>
            )
            const cls = 'flex flex-1 items-center gap-3.5 pt-2.5 pb-[18px]'
            return x.here ? (
              <div className={cls} aria-current="page">
                {body}
              </div>
            ) : (
              <Link href={`/anime/${x.id}`} className={cx(cls, 'group')}>
                {body}
              </Link>
            )
          })()}
        </li>
      ))}
    </ol>
  )
}
