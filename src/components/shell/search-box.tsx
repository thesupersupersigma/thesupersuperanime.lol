'use client'
import { Search } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { cx } from '@/lib/cx'

export type Suggestion = { anilistId: number; title: string; meta: string; picture: string | null }
type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'done'; items: Suggestion[] }

/** Header search: WAI-ARIA combobox with a debounced suggestions listbox (↑ ↓ move, Enter open, Esc close). */
export function SearchBox() {
  const router = useRouter()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setState({ kind: 'idle' })
    setState({ kind: 'loading' })
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        if (!res.ok) throw new Error(String(res.status))
        setState({ kind: 'done', items: await res.json() })
        setActive(-1)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ kind: 'error' })
      }
    }, 200)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q])

  // Ctrl/⌘ K focuses search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const items = state.kind === 'done' ? state.items : []
  const show = open && state.kind !== 'idle'
  const go = (s: Suggestion) => {
    setOpen(false)
    router.push(`/anime/${s.anilistId}`)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      const n = items.length
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : a <= 0 ? n - 1 : a - 1))
    } else if (e.key === 'Escape') {
      if (open) e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Enter') {
      const s = items[active]
      if (open && s) {
        e.preventDefault()
        go(s)
      }
    }
  }

  return (
    <div className="relative max-w-[520px] flex-[1_1_280px]">
      {/* biome-ignore lint/a11y/useSemanticElements: <search> isn't announced by every screen reader yet */}
      <form
        role="search"
        className="relative flex items-center"
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) {
            setOpen(false)
            router.push(`/search?q=${encodeURIComponent(q.trim())}`)
          }
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Search anime
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-3.5 size-[18px] text-muted" />
        <input
          ref={input}
          id={`${id}-q`}
          type="search"
          role="combobox"
          aria-expanded={show}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && show ? `${id}-o${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Search anime"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-md border border-line-2 bg-surface-1 pr-16 pl-10.5 text-fg transition-colors duration-hover placeholder:text-muted hover:border-line-3 focus-visible:border-fg"
        />
        <kbd className="pointer-events-none absolute right-3 hidden rounded-[6px] border border-line-3 px-1.5 py-0.5 font-sans text-xs text-fg-3 sm:block">
          Ctrl K
        </kbd>
      </form>
      <div
        className={cx(
          'absolute inset-x-0 top-13 z-30 flex animate-pop flex-col gap-1 rounded-lg border border-[#2a2a2a] bg-surface-1 p-2 shadow-pop',
          !show && 'hidden',
        )}
      >
        <div id={`${id}-list`} role="listbox" aria-label="Suggestions" aria-busy={state.kind === 'loading'}>
          {items.map((s, i) => (
            // biome-ignore lint/a11y/useFocusableInteractive: combobox option; focus stays in the input (aria-activedescendant)
            <div
              key={s.anilistId}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first
              onMouseDown={(e) => {
                e.preventDefault()
                go(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={cx(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] p-2',
                i === active && 'bg-surface-3',
              )}
            >
              <span className="relative h-[46px] w-[34px] flex-none overflow-hidden rounded-[6px] bg-surface-3">
                {s.picture && <Image src={s.picture} alt="" fill sizes="34px" className="object-cover" />}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold">{s.title}</span>
                <span className="text-xs text-muted">{s.meta}</span>
              </span>
            </div>
          ))}
        </div>
        <p role="status" className="px-2 text-[13px] text-fg-3 empty:hidden">
          {state.kind === 'loading' && !items.length && 'Searching…'}
          {state.kind === 'error' && 'Search is unavailable right now. Try again in a moment.'}
          {state.kind === 'done' &&
            !items.length &&
            `Nothing found for “${q.trim()}”. Try the Japanese (romaji) title.`}
        </p>
        <div className="flex gap-3.5 border-t border-[#222] px-2 pt-2 text-[11px] text-muted" aria-hidden>
          <span>↑ ↓ move</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
