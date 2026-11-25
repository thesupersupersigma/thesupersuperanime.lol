'use client'
import { Grid2x2, List } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cx } from '@/lib/cx'
import { useUserAnime } from './user-state'

export type Ep = { number: number; title?: string; thumbnail?: string; sub: boolean; dub: boolean }

const PAGE = 100

/**
 * Episodes as a list (thumbnail, title, SUB/DUB, progress) or a number grid; watched and in-progress states come
 * from the viewer's progress. Shows over 100 episodes are paged in ranges, and "jump to" finds any number.
 */
export function EpisodeList({
  anilistId,
  episodes,
  current,
  fallbackThumb,
  compact = false,
}: {
  anilistId: number
  episodes: Ep[]
  current?: number
  fallbackThumb?: string
  compact?: boolean
}) {
  const { progress } = useUserAnime()
  const [grid, setGrid] = useState(compact && episodes.length > 30)
  const [asc, setAsc] = useState(true)
  const sorted = useMemo(() => (asc ? episodes : [...episodes].reverse()), [episodes, asc])
  const pages = Math.ceil(sorted.length / PAGE)
  const startPage = current
    ? Math.max(
        0,
        sorted.findIndex((e) => e.number === current),
      )
    : 0
  const [page, setPage] = useState(Math.floor(startPage / PAGE))
  const [jump, setJump] = useState('')
  const [jumpMsg, setJumpMsg] = useState('')
  const shown = sorted.slice(page * PAGE, page * PAGE + PAGE)
  const state = useMemo(() => new Map(progress.map((p) => [p.episode, p])), [progress])
  const watched = progress.filter((p) => p.completed).length

  const goTo = (n: number) => {
    const i = sorted.findIndex((e) => e.number === n)
    if (i < 0) return setJumpMsg(`There’s no episode ${n} yet.`)
    setJumpMsg('')
    setPage(Math.floor(i / PAGE))
    requestAnimationFrame(() => document.getElementById(`ep-${anilistId}-${n}`)?.focus())
  }

  const seg = (on: boolean) =>
    cx(
      'flex size-9 items-center justify-center rounded-sm transition-colors duration-hover',
      on ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
    )

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="View"
            className="flex gap-0.5 rounded-sm border border-line-1 bg-bg p-[3px]"
          >
            {/* biome-ignore lint/a11y/useSemanticElements: segmented control, the WAI-ARIA radio pattern */}
            <button
              type="button"
              role="radio"
              aria-checked={!grid}
              aria-label="List view"
              className={seg(!grid)}
              onClick={() => setGrid(false)}
            >
              <List aria-hidden className="size-4" />
            </button>
            {/* biome-ignore lint/a11y/useSemanticElements: segmented control, the WAI-ARIA radio pattern */}
            <button
              type="button"
              role="radio"
              aria-checked={grid}
              aria-label="Number grid"
              className={seg(grid)}
              onClick={() => setGrid(true)}
            >
              <Grid2x2 aria-hidden className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setAsc(!asc)
              setPage(0)
            }}
            className="min-h-11 rounded-sm border border-line-2 bg-surface-1 px-3 text-[13px] font-semibold hover:bg-surface-3"
          >
            {asc ? 'Oldest first' : 'Newest first'}
          </button>
          {pages > 1 && (
            <select
              aria-label="Episode range"
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              className="min-h-11 rounded-sm border border-line-2 bg-surface-1 px-2 text-[13px]"
            >
              {Array.from({ length: pages }, (_, i) => {
                const a = sorted[i * PAGE]?.number
                const b = sorted[Math.min(sorted.length, (i + 1) * PAGE) - 1]?.number
                return (
                  <option key={a} value={i}>
                    {a}–{b}
                  </option>
                )
              })}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {episodes.length > 12 && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const n = Number(jump)
                if (Number.isInteger(n)) goTo(n)
              }}
            >
              <label htmlFor={`jump-${anilistId}`} className="sr-only">
                Jump to episode
              </label>
              <input
                id={`jump-${anilistId}`}
                inputMode="numeric"
                placeholder="Jump to episode #"
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-40 rounded-sm border border-line-2 bg-bg px-3 text-[13px] placeholder:text-muted"
              />
            </form>
          )}
          <span className="text-xs whitespace-nowrap text-muted">
            {watched} of {episodes.length} watched
          </span>
        </div>
      </div>
      <p role="status" className="text-[13px] text-fg-3 empty:hidden">
        {jumpMsg}
      </p>
      <ol
        className={cx(
          grid
            ? 'grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2'
            : compact
              ? 'flex flex-col gap-0.5'
              : 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3',
          compact && 'max-h-[640px] overflow-y-auto pr-1',
        )}
      >
        {shown.map((e, i) => {
          const p = state.get(e.number)
          const isCurrent = e.number === current
          const done = !!p?.completed
          const pct = done ? 100 : p?.durationSec ? Math.min(100, (p.positionSec / p.durationSec) * 100) : 0
          const href = `/watch/${anilistId}/${e.number}`
          const name = e.title ?? `Episode ${e.number}`
          const status = isCurrent ? 'Playing' : done ? 'Watched' : pct > 0 ? `${Math.round(pct)}% watched` : ''
          const id = `ep-${anilistId}-${e.number}`
          if (grid)
            return (
              <li key={e.number}>
                <Link
                  id={id}
                  href={href}
                  title={name}
                  aria-current={isCurrent ? 'page' : undefined}
                  aria-label={`Episode ${e.number}${status ? `, ${status}` : ''}`}
                  className={cx(
                    'flex h-11 items-center justify-center rounded-[10px] border text-[13px] font-bold transition-[border-color,transform] duration-hover hover:-translate-y-0.5 hover:border-[#4a4a4a]',
                    isCurrent
                      ? 'border-fg bg-fg text-bg'
                      : done
                        ? 'border-line-2 bg-surface-2 text-[#6e6e6e]'
                        : 'border-line-2 bg-surface-1',
                  )}
                >
                  {e.number}
                </Link>
              </li>
            )
          return (
            <li
              key={e.number}
              className={cx(!compact && 'animate-rise')}
              style={compact ? undefined : { animationDelay: `${Math.min(i, 14) * 25}ms` }}
            >
              <Link
                id={id}
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 rounded-[12px] border transition-[border-color,background-color,transform] duration-hover',
                  compact
                    ? 'min-h-11 border-transparent px-2.5 py-2 hover:bg-surface-2'
                    : 'p-2.5 hover:-translate-y-0.5 hover:border-[#4a4a4a]',
                  isCurrent ? 'border-fg bg-surface-2' : !compact && 'border-line-1 bg-surface-1',
                )}
              >
                {compact ? (
                  <span
                    className={cx(
                      'w-9 font-display text-sm font-bold tabular-nums',
                      isCurrent ? 'text-fg' : done ? 'text-[#6e6e6e]' : 'text-[#d9d9d9]',
                    )}
                  >
                    {e.number}
                  </span>
                ) : (
                  <span className="relative aspect-video w-24 flex-none overflow-hidden rounded-sm bg-surface-3">
                    {(e.thumbnail ?? fallbackThumb) && (
                      <Image
                        src={(e.thumbnail ?? fallbackThumb) as string}
                        alt=""
                        fill
                        sizes="96px"
                        className={cx('object-cover', !e.thumbnail && 'opacity-40 blur-[2px]')}
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/12">
                      <span className="block h-full bg-fg" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {!compact && (
                    <span
                      className={cx(
                        'flex items-center gap-1.5 text-xs font-bold',
                        isCurrent ? 'text-fg' : done ? 'text-[#6e6e6e]' : 'text-[#d9d9d9]',
                      )}
                    >
                      EP {e.number}
                      {e.sub && <Badge kind="sub">SUB</Badge>}
                      {e.dub && <Badge kind="dub">DUB</Badge>}
                    </span>
                  )}
                  <span
                    className={cx('truncate text-[13px]', done && !isCurrent ? 'text-[#8a8a8a]' : 'text-[#d9d9d9]')}
                  >
                    {name}
                  </span>
                </span>
                {(isCurrent || done) && <span className="flex-none text-[11px] text-muted">{status}</span>}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
