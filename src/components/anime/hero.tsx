'use client'
import { Check, ChevronDown, Link2, Play, Star, Tv } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button, buttonClass } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import { cx } from '@/lib/cx'
import { prefersReducedMotion } from '@/lib/motion'
import { continueTarget } from '@/lib/progress'
import { type ListStatus, useUserAnime } from './user-state'

/** Poster with a 3D mouse tilt and a light sheen; still under reduced motion and on touch screens. */
export function PosterTilt({ src, alt }: { src?: string; alt: string }) {
  const card = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => setOn(!prefersReducedMotion() && matchMedia('(hover: hover) and (pointer: fine)').matches), [])
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = card.current
    if (!on || !el) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.transform = `rotateX(${(0.5 - y) * 14}deg) rotateY(${(x - 0.5) * 18}deg)`
    el.style.setProperty('--sx', `${Math.round(x * 100)}%`)
    el.style.setProperty('--sy', `${Math.round(y * 100)}%`)
  }
  const reset = () => {
    if (!card.current) return
    card.current.style.transform = ''
    card.current.style.setProperty('--sx', '50%')
    card.current.style.setProperty('--sy', '30%')
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a mouse-only visual effect; nothing to operate
    <div className="flex-none [perspective:900px]" onMouseMove={move} onMouseLeave={reset} data-tilt={on || undefined}>
      <div
        ref={card}
        className="relative aspect-[2/3] w-[170px] overflow-hidden rounded-[18px] border border-line-3 bg-surface-3 shadow-[0_30px_60px_rgb(0_0_0/0.6)] transition-transform duration-[120ms] ease-out sm:w-[230px]"
      >
        {src && <Image src={src} alt={alt} fill priority sizes="230px" className="object-cover" />}
        {on && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--sx,50%)_var(--sy,30%),rgb(255_255_255/0.18),transparent_55%)]"
          />
        )}
      </div>
    </div>
  )
}

const pad = (v: number) => String(v).padStart(2, '0')
function left(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  return `${d ? `${d}d ` : ''}${pad(Math.floor((s % 86400) / 3600))}h ${pad(Math.floor((s % 3600) / 60))}m ${pad(s % 60)}s`
}

/** "EP 9 in 2d 03h 12m 05s" for airing shows; ticks every second. */
export function NextEpisode({ episode, airingAt }: { episode: number; airingAt: number }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-fg px-2.5 text-xs font-bold text-bg">
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-bg" />
      EP {episode}
      <span className="font-semibold">
        {now === null ? '' : airingAt * 1000 > now ? `in ${left(airingAt * 1000 - now)}` : 'out now'}
      </span>
    </span>
  )
}

/** Sanitized description (server-side), clamped to three lines with Read more. */
export function Description({ html }: { html: string }) {
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(true)
  const p = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = p.current
    if (el) setClamped(el.scrollHeight > el.clientHeight + 2)
  }, [])
  return (
    <div className="flex max-w-[780px] flex-col gap-2">
      <div
        ref={p}
        id="synopsis"
        className={cx('text-[15px] leading-[1.7] text-fg-2 [&_a]:underline', !open && 'line-clamp-3')}
        // sanitized with an allow-list on the server (src/server/sanitize.ts)
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="synopsis"
          onClick={() => setOpen(!open)}
          className="min-h-11 self-start font-bold"
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`

/** Watch (continue from progress, else episode 1), list status, trailer, copy link. */
export function AnimeActions({
  id,
  episodes,
  trailer,
}: {
  id: number
  episodes: number[]
  trailer: { site: string; id: string } | null
}) {
  const { progress } = useUserAnime()
  const toast = useToast()
  const target = continueTarget(progress, episodes)
  const row = target && progress.find((p) => p.episode === target.episode)
  const label = !target
    ? 'No episodes yet'
    : target.kind === 'resume'
      ? `Continue · EP ${target.episode}${row?.durationSec ? ` · ${mmss(row.durationSec - row.positionSec)} left` : ''}`
      : target.kind === 'next'
        ? `Watch next · EP ${target.episode}`
        : `Watch · EP ${target.episode}`
  const big = 'min-h-[50px] rounded-[13px] px-5'
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {target ? (
        <Link href={`/watch/${id}/${target.episode}`} className={buttonClass('primary', cx(big, 'px-6'))}>
          <Play aria-hidden className="size-4 fill-current" />
          {label}
        </Link>
      ) : (
        <span className={buttonClass('secondary', cx(big, 'pointer-events-none opacity-60'))}>{label}</span>
      )}
      <ListMenu />
      {trailer && <Trailer trailer={trailer} />}
      <Button
        variant="secondary"
        aria-label="Copy link"
        title="Copy link"
        className={cx(big, 'w-[50px] px-0')}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(location.href)
            toast({ text: 'Link copied' })
          } catch {
            toast({ text: 'Couldn’t copy. Copy the address bar instead.' })
          }
        }}
      >
        <Link2 aria-hidden className="size-[18px]" />
      </Button>
    </div>
  )
}

export const STATUSES: { value: ListStatus; label: string }[] = [
  { value: 'watching', label: 'Watching' },
  { value: 'planning', label: 'Planning' },
  { value: 'completed', label: 'Completed' },
  { value: 'paused', label: 'Paused' },
  { value: 'dropped', label: 'Dropped' },
]

function ListMenu() {
  const { list, setList } = useUserAnime()
  const toast = useToast()
  const current = STATUSES.find((s) => s.value === list?.status)
  const pick = async (status: ListStatus | null) => {
    const ok = await setList(status, status ? (list?.score ?? null) : null)
    const label = STATUSES.find((s) => s.value === status)?.label
    toast({ text: !ok ? 'Couldn’t save. Try again.' : label ? `Moved to ${label}` : 'Removed from your list' })
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" className="min-h-[50px] rounded-[13px] px-4">
          {current ? (
            <>
              <Check aria-hidden className="size-4" />
              {current.label}
            </>
          ) : (
            'Add to list'
          )}
          <ChevronDown aria-hidden className="size-3.5" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        {STATUSES.map((s) => (
          <MenuItem key={s.value} onSelect={() => pick(s.value)} className="justify-between">
            {s.label}
            {s.value === list?.status && <Check aria-label="current" className="text-fg!" />}
          </MenuItem>
        ))}
        {list && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => pick(null)}>Remove from list</MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}

/** Nothing is loaded from YouTube until the dialog opens (the iframe only exists while it's open). */
function Trailer({ trailer }: { trailer: { site: string; id: string } }) {
  const big = 'min-h-[50px] rounded-[13px] px-4'
  if (trailer.site !== 'youtube')
    return (
      <a
        href={`https://www.dailymotion.com/video/${encodeURIComponent(trailer.id)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass('secondary', big)}
      >
        <Tv aria-hidden className="size-4" />
        Trailer
      </a>
    )
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className={big}>
          <Tv aria-hidden className="size-4" />
          Trailer
        </Button>
      </DialogTrigger>
      <DialogContent title="Trailer" wide>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.id)}?autoplay=1`}
          title="Trailer"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video w-full rounded-md border-0 bg-black"
        />
      </DialogContent>
    </Dialog>
  )
}

/** 1–5 stars = ListEntry.score 20–100. Rating something not on the list puts it in Completed. */
export function Rating() {
  const { list, setList } = useUserAnime()
  const toast = useToast()
  const stars = list?.score ? Math.round(list.score / 20) : 0
  const [hover, setHover] = useState(0)
  const shown = hover || stars
  return (
    <div role="radiogroup" aria-label="Your rating" className="flex" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        // biome-ignore lint/a11y/useSemanticElements: star rating buttons, the WAI-ARIA radio pattern
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === stars}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)}
          onClick={async () => {
            const ok = await setList(list?.status ?? 'completed', n * 20)
            toast({
              text: !ok ? 'Couldn’t save. Try again.' : `Rated ${n} / 5${list ? '' : ' · added to Completed'}`,
            })
          }}
          className={cx('flex size-11 items-center justify-center', n <= shown ? 'text-fg' : 'text-[#5a5a5a]')}
        >
          <Star aria-hidden className={cx('size-5', n <= shown && 'fill-current')} />
        </button>
      ))}
    </div>
  )
}
