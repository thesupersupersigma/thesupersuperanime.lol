'use client'
import '@videojs/react/video/skin.css'
import { HlsJsVideo } from '@videojs/react/media/hlsjs-video'
import { usePlayer, VideoPlayer, VideoSkin } from '@videojs/react/video'
import { Captions, Check, ChevronsRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { savePrefs, saveProgress } from '@/app/actions'
import { useUserAnime } from '@/components/anime/user-state'
import { buttonClass } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cx } from '@/lib/cx'
import { type Prefs, readGuest, writeGuest } from '@/lib/guest'
import { prefersReducedMotion } from '@/lib/motion'
import { completesAt, putGuestProgress } from '@/lib/progress'
import { chooseSkip, keyAction, nextServer, type Range, type Server, SHORTCUTS, srtToVtt } from '@/lib/watch'

type Props = {
  anilistId: number
  episode: number
  episodeTitle?: string
  title: string
  poster?: string
  prev?: number
  next?: number
  hasDub: boolean
  signedIn: boolean
  accountPrefs: Prefs | null
  sidebar: ReactNode
}

/** The player lives in Video.js's context; everything below reads and drives it through usePlayer. */
export function WatchClient(props: Props) {
  // remote images only go through our optimizer (CSP + IMAGE_HOSTS)
  const poster = props.poster && `/_next/image?url=${encodeURIComponent(props.poster)}&w=1920&q=75`
  return (
    // no title inside the player: the page's own heading says it, and on phones it would cover the overlays
    <VideoPlayer poster={poster ?? null}>
      <Watch {...props} />
    </VideoPlayer>
  )
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
const UP_NEXT_SEC = 10

function Watch({
  anilistId: id,
  episode: ep,
  episodeTitle,
  title,
  prev,
  next,
  hasDub,
  signedIn,
  accountPrefs,
  sidebar,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const { progress, putProgress } = useUserAnime()
  const store = usePlayer()
  const time = usePlayer((s) => s.currentTime)
  const duration = usePlayer((s) => s.duration)
  const paused = usePlayer((s) => s.paused)
  const started = usePlayer((s) => s.started)
  const error = usePlayer((s) => s.error)
  const muted = usePlayer((s) => s.muted)
  const fullscreen = usePlayer((s) => s.isFullscreen)
  const controlsVisible = usePlayer((s) => s.controlsVisible)

  // ---- preferences: the account's when signed in, else this browser's
  const [prefs, setPrefs] = useState<Prefs>(accountPrefs ?? {})
  useEffect(() => {
    if (!signedIn) setPrefs(readGuest().settings?.prefs ?? {})
  }, [signedIn])
  const setPref = (patch: Prefs) => {
    setPrefs((p) => ({ ...p, ...patch }))
    if (signedIn) savePrefs(patch).catch(() => {})
    else {
      const g = readGuest()
      writeGuest({ ...g, settings: { prefs: { ...g.settings?.prefs, ...patch }, updatedAt: new Date().toISOString() } })
    }
  }
  const autoNext = prefs.autoplay ?? true
  const autoSkip = prefs.autoskip ?? false
  const autoResume = prefs.autoResume ?? false

  // ---- servers
  const [servers, setServers] = useState<Server[] | null>(null)
  const [loadErr, setLoadErr] = useState<'no_episode' | 'down' | 'limited' | 'none_played' | null>(null)
  const [current, setCurrent] = useState<Server | null>(null)
  const expires = useRef(0)
  const failed = useRef(new Set<string>())
  const pendingSeek = useRef<{ t: number; play: boolean } | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const [autoPlay] = useState(() => typeof window !== 'undefined' && sessionStorage.getItem('autoplay-next') === '1')

  const select = useCallback((s: Server, keepTime: boolean) => {
    const v = video.current
    pendingSeek.current = keepTime && v && v.currentTime > 0 ? { t: v.currentTime, play: !v.paused } : null
    setCurrent(s)
  }, [])

  const load = useCallback(
    async (keep?: { key: string; time: boolean }) => {
      setLoadErr(null)
      try {
        const r = await fetch(`/api/streams/${id}/${ep}`, { cache: 'no-store' })
        if (!r.ok) return setLoadErr(r.status === 404 ? 'no_episode' : r.status === 429 ? 'limited' : 'down')
        const j = (await r.json()) as { expiresAt: string; servers: Server[] }
        expires.current = Date.parse(j.expiresAt)
        failed.current.clear()
        setServers(j.servers)
        const audio = prefs.audio === 'dub' && j.servers.some((s) => s.audio === 'dub') ? 'dub' : 'sub'
        const pick =
          j.servers.find((s) => s.key === keep?.key) ?? j.servers.find((s) => s.audio === audio) ?? j.servers[0]
        if (pick) select(pick, !!keep?.time)
      } catch {
        setLoadErr('down')
      }
    },
    // prefs.audio only matters for the first pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, ep, select],
  )
  useEffect(() => {
    sessionStorage.removeItem('autoplay-next')
    load()
  }, [load])

  // links only limit *starting* playback: before the first play, refresh them once they're about to expire
  useEffect(() => {
    if (started || !current) return
    const t = setInterval(() => {
      if (Date.now() > expires.current - 15_000) load({ key: current.key, time: false })
    }, 15_000)
    return () => clearInterval(t)
  }, [started, current, load])

  const fail = useCallback(
    (s: Server) => {
      failed.current.add(s.key)
      const n = servers && nextServer(servers, s, failed.current)
      if (n) {
        toast({ text: `${s.name} didn’t load. Trying ${n.name}${n.source !== s.source ? ` (${n.source})` : ''}.` })
        select(n, true)
      } else setLoadErr('none_played')
    },
    [servers, select, toast],
  )

  // a server that errors, or doesn't load within 20 s, hands over to the next one
  const loaded = useRef(false)
  useEffect(() => {
    if (!current) return
    loaded.current = false
    const t = setTimeout(() => !loaded.current && fail(current), 20_000)
    return () => clearTimeout(t)
  }, [current, fail])
  useEffect(() => {
    if (error && current) {
      store.dismissError()
      fail(current)
    }
  }, [error, current, fail, store])

  // ---- skip times: the server's own, else AniSkip for this stream's real length
  const [aniskip, setAniskip] = useState<{ intro?: Range; outro?: Range } | null>(null)
  const skip = useMemo(() => chooseSkip(current ?? {}, aniskip), [current, aniskip])
  const askedSkip = useRef(false)

  // ---- resume
  const saved = progress.find((p) => p.episode === ep)
  const [resumeAt, setResumeAt] = useState<number | null>(null)
  const resumeChecked = useRef(false)

  const onLoadedMetadata = () => {
    const v = video.current
    if (!v) return
    loaded.current = true
    if (pendingSeek.current) {
      v.currentTime = pendingSeek.current.t
      if (pendingSeek.current.play) v.play().catch(() => {})
      pendingSeek.current = null
    } else if (!resumeChecked.current) {
      resumeChecked.current = true
      if (saved && !saved.completed && saved.positionSec > 15 && saved.positionSec < v.duration - 30) {
        if (autoResume) {
          v.currentTime = saved.positionSec
          toast({ text: `Continued from ${mmss(saved.positionSec)}` })
        } else setResumeAt(saved.positionSec)
      }
    }
    if (!askedSkip.current && current && (!current.intro || !current.outro) && v.duration > 0) {
      askedSkip.current = true
      fetch(`/api/skip/${id}/${ep}?duration=${Math.round(v.duration)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && setAniskip(s))
        .catch(() => {})
    }
  }

  // ---- progress: every ~10 s while playing, on pause, at the end, and as a beacon when the page goes away
  const outroStart = skip.outro?.start
  const save = useCallback(
    (opts: { completed?: boolean; beacon?: boolean } = {}) => {
      const v = video.current
      if (!v?.duration || !Number.isFinite(v.duration) || v.currentTime < 1) return
      const row = {
        anilistId: id,
        episode: ep,
        positionSec: Math.round(v.currentTime),
        durationSec: Math.round(v.duration),
        completed: opts.completed ?? v.currentTime >= completesAt(v.duration, outroStart),
      }
      const updatedAt = new Date().toISOString()
      putProgress({ ...row, updatedAt })
      if (!signedIn) return writeGuest(putGuestProgress(readGuest(), { ...row, updatedAt }))
      if (opts.beacon)
        navigator.sendBeacon('/api/progress', new Blob([JSON.stringify(row)], { type: 'application/json' }))
      else saveProgress(row).catch(() => {})
    },
    [id, ep, signedIn, outroStart, putProgress],
  )
  useEffect(() => {
    const t = setInterval(() => video.current && !video.current.paused && save(), 10_000)
    const hide = () => save({ beacon: true })
    const vis = () => document.visibilityState === 'hidden' && hide()
    addEventListener('pagehide', hide)
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      removeEventListener('pagehide', hide)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [save])
  // crossing the "watched" line saves straight away, so the episode list updates
  const crossed = useRef(false)
  useEffect(() => {
    if (!crossed.current && duration > 0 && time >= completesAt(duration, outroStart)) {
      crossed.current = true
      save({ completed: true })
    }
  }, [time, duration, outroStart, save])

  // ---- navigation + up next
  const go = useCallback(
    (n: number | undefined, auto = false) => {
      if (n === undefined) return
      save()
      if (auto) sessionStorage.setItem('autoplay-next', '1')
      router.push(`/watch/${id}/${n}`)
    },
    [id, router, save],
  )
  const [cancelled, setCancelled] = useState(false)
  const upNextFrom = outroStart ?? (duration > 0 ? duration - UP_NEXT_SEC : Number.POSITIVE_INFINITY)
  const showUpNext = next !== undefined && duration > 0 && time >= upNextFrom && !cancelled
  const [left, setLeft] = useState(UP_NEXT_SEC)
  useEffect(() => {
    if (!showUpNext || !autoNext) return setLeft(UP_NEXT_SEC)
    const t0 = Date.now()
    const t = setInterval(() => {
      const l = Math.max(0, UP_NEXT_SEC - (Date.now() - t0) / 1000)
      setLeft(l)
      if (l === 0) {
        clearInterval(t)
        go(next, true)
      }
    }, 250)
    return () => clearInterval(t)
  }, [showUpNext, autoNext, next, go])

  // ---- intro / outro
  const inIntro = !!skip.intro && time >= skip.intro.start && time < skip.intro.end - 1
  const inOutro = !!skip.outro && time >= skip.outro.start && time < skip.outro.end - 1
  const autoSkipped = useRef(new Set<string>())
  useEffect(() => {
    if (!autoSkip) return
    for (const [name, r, on] of [['intro', skip.intro, inIntro] as const, ['outro', skip.outro, inOutro] as const]) {
      if (on && r && !autoSkipped.current.has(name)) {
        autoSkipped.current.add(name)
        store.seek(r.end)
        toast({ text: `Skipped the ${name}` })
      }
    }
  }, [autoSkip, inIntro, inOutro, skip, store, toast])

  // ---- subtitles: ASS through JASSUB (libass), VTT/SRT as a normal text track
  const [subUrl, setSubUrl] = useState<string | null>(null)
  const lastSub = useRef<string | null>(null)
  const subsOff = useRef(false)
  useEffect(() => {
    if (!current) return
    if (subsOff.current) return setSubUrl(null)
    const prevSub = current.subtitles.find((s) => s.url === lastSub.current)
    const byLang = prevSub && current.subtitles.find((s) => s.lang === prevSub.lang)
    const pick =
      byLang ??
      (current.audio === 'sub'
        ? (current.subtitles.find((s) => s.default) ?? current.subtitles.find((s) => s.lang.startsWith('en')))
        : undefined)
    setSubUrl(pick?.url ?? null)
  }, [current])
  const sub = current?.subtitles.find((s) => s.url === subUrl)
  const chooseSub = (url: string | null) => {
    subsOff.current = url === null
    if (url) lastSub.current = url
    setSubUrl(url)
  }

  useEffect(() => {
    if (!videoEl || sub?.format !== 'ass') return
    let dead = false
    let inst: { destroy: () => void } | undefined
    import('jassub').then(({ default: JASSUB }) => {
      if (dead) return
      try {
        inst = new JASSUB({ video: videoEl, subUrl: sub.url })
      } catch {
        toast({ text: 'This browser can’t draw styled subtitles.' })
      }
    })
    return () => {
      dead = true
      inst?.destroy()
    }
  }, [videoEl, sub, toast])

  const [vttUrl, setVttUrl] = useState<string | null>(null)
  useEffect(() => {
    setVttUrl(null)
    if (!sub || sub.format === 'ass') return
    if (sub.format === 'vtt') return setVttUrl(sub.url)
    let url: string | null = null
    fetch(sub.url)
      .then((r) => r.text())
      .then((t) => {
        url = URL.createObjectURL(new Blob([srtToVtt(t)], { type: 'text/vtt' }))
        setVttUrl(url)
      })
      .catch(() => {})
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [sub])

  // ---- page modes
  const [theater, setTheater] = useState(false)
  const [lights, setLights] = useState(false)
  const [help, setHelp] = useState(false)
  const [subPanel, setSubPanel] = useState(false)

  // ---- keyboard: one page-wide handler (capture) so keys work wherever focus is, without the skin acting twice
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e: KeyboardEvent) => {
    const a = keyAction(e)
    const t = e.target as HTMLElement | null
    if (!a || !t || t.closest('input, textarea, select, [contenteditable="true"]')) return
    const control = t.closest(
      'button, a, [role^="menuitem"], [role="radio"], [role="slider"], [role="tab"], [role="option"], [role="switch"]',
    )
    if (a === 'toggle-play' && control && e.key === ' ') return
    if (
      (a === 'back-5' || a === 'forward-5') &&
      t.closest('[role="slider"], [role="radio"], [role="menu"], [role="tablist"]')
    )
      return
    const v = video.current
    e.preventDefault()
    e.stopPropagation()
    const seekBy = (d: number) => v && store.seek(Math.max(0, Math.min(v.duration || 0, v.currentTime + d)))
    switch (a) {
      case 'toggle-play':
        return paused ? store.play().catch(() => {}) : store.pause()
      case 'back-10':
        return seekBy(-10)
      case 'forward-10':
        return seekBy(10)
      case 'back-5':
        return seekBy(-5)
      case 'forward-5':
        return seekBy(5)
      case 'fullscreen':
        return fullscreen ? store.exitFullscreen() : store.requestFullscreen().catch(() => {})
      case 'mute':
        return store.setMuted(!muted)
      case 'theater':
        return setTheater((x) => !x)
      case 'captions':
        return chooseSub(subUrl ? null : (lastSub.current ?? current?.subtitles[0]?.url ?? null))
      case 'next':
        return go(next)
      case 'previous':
        return go(prev)
      case 'help':
        return setHelp((x) => !x)
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e)
    document.addEventListener('keydown', h, true)
    return () => document.removeEventListener('keydown', h, true)
  }, [])
  useEffect(() => {
    if (!lights) return
    const off = (e: KeyboardEvent) => e.key === 'Escape' && setLights(false)
    addEventListener('keydown', off)
    return () => removeEventListener('keydown', off)
  }, [lights])

  const [ring, setRing] = useState(true)
  useEffect(() => setRing(!prefersReducedMotion()), [])

  const rows = (['sub', 'dub'] as const).map((audio) => ({
    audio,
    list: servers?.filter((s) => s.audio === audio) ?? [],
  }))
  const overlay = 'absolute z-10 rounded-[14px] border border-line-3 bg-[rgb(21_21_21/0.94)] shadow-pop animate-pop'
  const toggles: [string, boolean, () => void][] = [
    ['Auto next', autoNext, () => setPref({ autoplay: !autoNext })],
    ['Auto skip', autoSkip, () => setPref({ autoskip: !autoSkip })],
    ['Auto resume', autoResume, () => setPref({ autoResume: !autoResume })],
    ['Theater', theater, () => setTheater(!theater)],
    ['Lights off', lights, () => setLights(!lights)],
  ]

  return (
    <div className="flex flex-wrap items-start gap-6">
      {lights && (
        <button
          type="button"
          aria-label="Turn the lights back on"
          onClick={() => setLights(false)}
          className="fixed inset-0 z-[25] animate-pop cursor-pointer bg-black/90"
        />
      )}
      <div className={cx('flex min-w-0 flex-col gap-4', theater ? 'basis-full' : 'flex-[999_1_720px]')}>
        <section
          aria-label="Video player"
          className={cx(
            'watch-player relative z-30',
            lights && 'shadow-[0_0_0_1px_#333,0_30px_120px_rgb(245_245_245/0.08)]',
          )}
          data-sub-size={prefs.subtitleSize ?? 'm'}
          data-sub-bg={prefs.subtitleBg ? 'on' : undefined}
        >
          <VideoSkin className="aspect-video w-full overflow-hidden rounded-[16px] bg-black">
            {current && (
              <HlsJsVideo
                ref={(el) => {
                  video.current = el
                  setVideoEl(el)
                }}
                src={current.url}
                crossOrigin="anonymous"
                playsInline
                autoPlay={autoPlay}
                onLoadedMetadata={onLoadedMetadata}
                onPause={() => save()}
                onEnded={() => {
                  save({ completed: true })
                  if (autoNext && !cancelled) go(next, true)
                }}
              >
                {vttUrl && sub && (
                  <track key={vttUrl} kind="subtitles" src={vttUrl} srcLang={sub.lang} label={sub.label} default />
                )}
              </HlsJsVideo>
            )}

            {!current && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                {loadErr ? (
                  <div role="alert" className="flex max-w-[420px] flex-col items-center gap-3">
                    <p className="font-semibold">
                      {loadErr === 'no_episode'
                        ? 'This episode isn’t on any source right now.'
                        : loadErr === 'limited'
                          ? 'Too many requests. Wait a minute, then try again.'
                          : 'The video servers aren’t answering.'}
                    </p>
                    <button type="button" className={buttonClass('primary')} onClick={() => load()}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <p role="status" className="flex items-center gap-2.5 text-fg-3">
                    <span
                      aria-hidden
                      className="size-5 animate-spin rounded-full border-2 border-fg-3 border-t-transparent"
                    />
                    Finding servers…
                  </p>
                )}
              </div>
            )}
            {loadErr === 'none_played' && current && (
              <div role="alert" className={cx(overlay, 'inset-x-6 top-6 flex flex-wrap items-center gap-3 p-4')}>
                <span className="flex-1">None of the servers could play this episode. Links may have expired.</span>
                <button
                  type="button"
                  className={buttonClass('primary', 'min-h-10')}
                  onClick={() => load({ key: current.key, time: true })}
                >
                  Try again
                </button>
              </div>
            )}

            {resumeAt !== null && (
              <div
                role="dialog"
                aria-label="Resume"
                className={cx(overlay, 'top-5 left-5 flex items-center gap-3 py-2.5 pr-2.5 pl-4')}
              >
                <span className="text-[13px]">
                  Continue from <strong>{mmss(resumeAt)}</strong>?
                </span>
                <button
                  type="button"
                  className={buttonClass('primary', 'min-h-9 rounded-[9px] px-3')}
                  onClick={() => {
                    store.seek(resumeAt)
                    store.play().catch(() => {})
                    setResumeAt(null)
                  }}
                >
                  Resume
                </button>
                <button
                  type="button"
                  className={buttonClass('secondary', 'min-h-9 rounded-[9px] px-3')}
                  onClick={() => setResumeAt(null)}
                >
                  Start over
                </button>
              </div>
            )}

            {started && (inIntro || inOutro) && !showUpNext && (
              <button
                type="button"
                onClick={() => store.seek(inIntro ? (skip.intro as Range).end : (skip.outro as Range).end)}
                className="absolute right-3 bottom-16 z-10 inline-flex min-h-11 sm:right-5 sm:bottom-24 animate-pop items-center gap-2 rounded-[11px] border border-fg bg-bg/75 px-4.5 font-bold transition-transform duration-hover hover:-translate-y-px"
              >
                {inIntro ? 'Skip intro' : 'Skip outro'}
                <ChevronsRight aria-hidden className="size-4" />
              </button>
            )}

            {showUpNext && (
              <div
                role="status"
                className={cx(overlay, 'right-5 bottom-24 flex w-[min(300px,80%)] flex-col gap-2.5 p-3.5')}
              >
                <div className="flex items-center gap-3">
                  {autoNext && (
                    <span className="relative size-11 flex-none">
                      {ring && (
                        <svg aria-hidden width="44" height="44" viewBox="0 0 44 44" data-ring>
                          <circle cx="22" cy="22" r="18" fill="none" stroke="#333" strokeWidth="3" />
                          <circle
                            cx="22"
                            cy="22"
                            r="18"
                            fill="none"
                            stroke="#f5f5f5"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray="113"
                            strokeDashoffset={113 * (1 - left / UP_NEXT_SEC)}
                            transform="rotate(-90 22 22)"
                            className="transition-[stroke-dashoffset] duration-[250ms] ease-linear"
                          />
                        </svg>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center font-display font-extrabold">
                        {Math.ceil(left)}
                      </span>
                    </span>
                  )}
                  <span className="flex flex-col">
                    <span className="text-[11px] tracking-[0.08em] text-muted uppercase">Up next</span>
                    <span className="font-semibold">Episode {next}</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={buttonClass('primary', 'min-h-10 flex-1')}
                    onClick={() => go(next, true)}
                  >
                    Play now
                  </button>
                  <button
                    type="button"
                    className={buttonClass('secondary', 'min-h-10 flex-1')}
                    onClick={() => setCancelled(true)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {current && current.subtitles.length > 0 && (
              <div
                className={cx(
                  'absolute top-3 right-3 z-10 transition-opacity duration-slow',
                  !controlsVisible && !subPanel && 'pointer-events-none opacity-0',
                )}
              >
                <button
                  type="button"
                  aria-expanded={subPanel}
                  aria-controls="sub-panel"
                  onClick={() => setSubPanel(!subPanel)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-black/55 px-3 text-[13px] font-semibold backdrop-blur hover:bg-black/75"
                >
                  <Captions aria-hidden className="size-[18px] flex-none" />
                  <span className="max-w-[40vw] truncate sm:max-w-[240px]">{sub ? sub.label : 'Subtitles off'}</span>
                </button>
                {subPanel && (
                  <div
                    id="sub-panel"
                    className={cx(
                      overlay,
                      'top-13 right-0 flex max-h-[min(420px,70vh)] w-[280px] flex-col gap-3 overflow-y-auto p-3.5 text-[13px]',
                    )}
                  >
                    <div role="radiogroup" aria-label="Subtitle track" className="flex flex-col">
                      {[null, ...current.subtitles].map((s) => (
                        // biome-ignore lint/a11y/useSemanticElements: a radio list styled as menu rows
                        <button
                          key={s?.url ?? 'off'}
                          type="button"
                          role="radio"
                          aria-checked={(s?.url ?? null) === subUrl}
                          onClick={() => chooseSub(s?.url ?? null)}
                          className="flex min-h-10 items-center justify-between gap-2 rounded-sm px-2 text-left hover:bg-surface-3"
                        >
                          <span>
                            {s ? s.label : 'Off'}
                            {s && (
                              <span className="ml-1.5 text-[11px] text-muted uppercase">
                                {s.format === 'ass' ? 'styled' : s.format}
                              </span>
                            )}
                          </span>
                          {(s?.url ?? null) === subUrl && <Check aria-hidden className="size-4" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] tracking-[0.08em] text-muted uppercase">Subtitle size</span>
                      <div className="grid grid-cols-4 gap-1">
                        {(['s', 'm', 'l', 'xl'] as const).map((z) => (
                          <button
                            key={z}
                            type="button"
                            aria-pressed={(prefs.subtitleSize ?? 'm') === z}
                            onClick={() => setPref({ subtitleSize: z })}
                            className={cx(
                              'min-h-9 rounded-sm text-xs font-bold uppercase',
                              (prefs.subtitleSize ?? 'm') === z ? 'bg-fg text-bg' : 'bg-surface-3',
                            )}
                          >
                            {z}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!prefs.subtitleBg}
                      onClick={() => setPref({ subtitleBg: !prefs.subtitleBg })}
                      className="flex min-h-9 items-center justify-between"
                    >
                      Subtitle background
                      <Knob on={!!prefs.subtitleBg} />
                    </button>
                    {sub?.format === 'ass' && (
                      <p className="text-xs text-muted">Styled subtitles keep the look and size their file sets.</p>
                    )}
                    <p className="text-xs text-muted">Speed and quality are in the player’s settings menu.</p>
                  </div>
                )}
              </div>
            )}

            {help && (
              <div
                role="dialog"
                aria-label="Keyboard shortcuts"
                className={cx(
                  overlay,
                  'top-1/2 left-1/2 flex max-h-[90%] w-[min(380px,90%)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-y-auto p-4.5',
                )}
              >
                <span className="mb-1 font-display text-lg font-bold">Keyboard shortcuts</span>
                {SHORTCUTS.map((s) => (
                  <div key={s.label} className="flex justify-between text-[13px] text-fg-2">
                    <span>{s.label}</span>
                    <span className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[22px] rounded-[6px] border border-[#3a3a3a] bg-bg px-1.5 py-0.5 text-center font-sans text-xs text-fg"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted">
                  On phones: double-tap the left or right side to go back or forward 10 seconds.
                </p>
                <button
                  type="button"
                  // the panel opens from the keyboard: move focus to its only control
                  ref={(b) => b?.focus()}
                  className={buttonClass('primary', 'mt-1.5 min-h-10')}
                  onClick={() => setHelp(false)}
                >
                  Got it
                </button>
              </div>
            )}
          </VideoSkin>
        </section>

        <div className="flex flex-wrap items-center gap-1.5 rounded-[14px] border border-line-1 bg-surface-1 p-1.5">
          {toggles.map(([label, on, flip]) => (
            <button
              key={label}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={flip}
              className={cx(
                'inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold hover:bg-surface-3',
                on ? 'text-fg' : 'text-fg-3',
                label === 'Theater' && 'max-lg:hidden',
              )}
            >
              <Knob on={on} />
              {label}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            disabled={prev === undefined}
            onClick={() => go(prev)}
            className={buttonClass('ghost', 'min-h-10 text-fg')}
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={next === undefined}
            onClick={() => go(next)}
            className={buttonClass('primary', 'min-h-10')}
          >
            Next →
          </button>
        </div>

        <section aria-label="Servers" className="flex flex-wrap overflow-hidden rounded-[16px] border border-line-1">
          <div className="flex flex-[1_1_240px] flex-col justify-center gap-1.5 bg-fg p-[18px] text-bg">
            <span className="text-[13px]">You’re watching</span>
            <span className="font-display text-xl font-extrabold">Episode {ep}</span>
            <span className="text-xs leading-normal text-[#444]">
              If a server doesn’t load, the next one is tried for you. Switching keeps your place.
            </span>
          </div>
          <div className="flex flex-[999_1_420px] flex-col gap-3 bg-surface-1 px-[18px] py-4">
            {rows.map(({ audio, list }) => (
              <div key={audio} className="flex flex-wrap items-center gap-2.5">
                <span className="w-[54px] text-xs font-extrabold tracking-[0.06em] text-fg-3 uppercase">{audio}</span>
                {list.length ? (
                  list.map((s) => {
                    const on = s.key === current?.key
                    return (
                      <button
                        key={s.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          if (on) return
                          if (audio !== current?.audio) setPref({ audio })
                          if (!started && Date.now() > expires.current - 15_000) load({ key: s.key, time: true })
                          else {
                            select(s, true)
                            toast({
                              text: `Switched to ${audio.toUpperCase()} · ${s.name}${video.current?.currentTime ? `, kept your place at ${mmss(video.current.currentTime)}` : ''}`,
                            })
                          }
                        }}
                        className={cx(
                          'inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-bold transition-transform duration-hover hover:-translate-y-px',
                          on ? 'border-fg bg-fg text-bg' : 'border-[#2a2a2a] bg-bg',
                          failed.current.has(s.key) && !on && 'line-through opacity-60',
                        )}
                      >
                        {s.name}
                        {s.source !== s.name && <span className="font-medium opacity-70">{s.source}</span>}
                      </button>
                    )
                  })
                ) : (
                  <span className="text-[13px] text-muted">
                    {!servers ? 'Loading…' : audio === 'dub' && !hasDub ? 'No dub for this episode' : 'None available'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em] sm:text-[26px]">
              Episode {ep}
              {episodeTitle ? ` · ${episodeTitle}` : ''}
            </h1>
            <Link
              href={`/anime/${id}`}
              className="inline-flex min-h-11 items-center self-start text-fg-3 hover:text-fg"
            >
              {title}
            </Link>
          </div>
          <button
            type="button"
            className={buttonClass('secondary')}
            disabled={saved?.completed}
            onClick={() => {
              const v = video.current
              const row = {
                anilistId: id,
                episode: ep,
                positionSec: Math.round(v?.duration || saved?.durationSec || 0),
                durationSec: Math.round(v?.duration || saved?.durationSec || 0),
                completed: true,
              }
              const updatedAt = new Date().toISOString()
              putProgress({ ...row, updatedAt })
              if (signedIn) saveProgress(row).catch(() => {})
              else writeGuest(putGuestProgress(readGuest(), { ...row, updatedAt }))
              toast({ text: `Episode ${ep} marked as watched` })
            }}
          >
            <Check aria-hidden className="size-4" />
            {saved?.completed ? 'Watched' : 'Mark watched'}
          </button>
        </div>
      </div>

      <aside className={cx('flex min-w-0 flex-col gap-4.5', theater ? 'basis-full' : 'max-w-[440px] flex-[1_1_340px]')}>
        {sidebar}
      </aside>
    </div>
  )
}

function Knob({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'relative inline-block h-[18px] w-[30px] rounded-full transition-colors duration-hover',
        on ? 'bg-fg' : 'bg-line-3',
      )}
    >
      <span
        className={cx(
          'absolute top-[3px] size-3 rounded-full transition-[left] duration-hover',
          on ? 'left-[15px] bg-bg' : 'left-[3px] bg-fg',
        )}
      />
    </span>
  )
}
