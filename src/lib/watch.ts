// Player rules that don't need a browser: kept here so they can be unit-tested.

export type Range = { start: number; end: number }
export type Subtitle = { lang: string; label: string; url: string; format: 'ass' | 'srt' | 'vtt'; default: boolean }
export type Server = {
  key: string
  source: string
  audio: 'sub' | 'dub'
  name: string
  url: string
  type: 'hls' | 'mp4'
  intro?: Range
  outro?: Range
  subtitles: Subtitle[]
}

/** Browsers and Video.js only read WebVTT; SRT differs in the header and the decimal comma. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return `WEBVTT\n\n${body.trim()}\n`
}

/** The server's own times win; AniSkip fills only what the server doesn't give. Nonsense ranges are dropped. */
export function chooseSkip(server: { intro?: Range; outro?: Range }, aniskip: { intro?: Range; outro?: Range } | null) {
  const ok = (r?: Range) => (r && r.end > r.start && r.start >= 0 ? r : undefined)
  return { intro: ok(server.intro) ?? ok(aniskip?.intro), outro: ok(server.outro) ?? ok(aniskip?.outro) }
}

/** The next server to try after `failed`: same audio first (in source order), never one that already failed. */
export function nextServer(servers: Server[], current: Server, failed: Set<string>): Server | undefined {
  const untried = servers.filter((s) => s.key !== current.key && !failed.has(s.key))
  return untried.find((s) => s.audio === current.audio) ?? untried[0]
}

export type Action =
  | 'toggle-play'
  | 'back-10'
  | 'forward-10'
  | 'back-5'
  | 'forward-5'
  | 'fullscreen'
  | 'mute'
  | 'theater'
  | 'captions'
  | 'next'
  | 'previous'
  | 'help'

/** The shortcuts sheet and the key handler both read this list. */
export const SHORTCUTS: { keys: string[]; label: string; action: Action }[] = [
  { keys: ['Space', 'K'], label: 'Play / pause', action: 'toggle-play' },
  { keys: ['J'], label: 'Back 10 seconds', action: 'back-10' },
  { keys: ['L'], label: 'Forward 10 seconds', action: 'forward-10' },
  { keys: ['←'], label: 'Back 5 seconds', action: 'back-5' },
  { keys: ['→'], label: 'Forward 5 seconds', action: 'forward-5' },
  { keys: ['F'], label: 'Fullscreen', action: 'fullscreen' },
  { keys: ['M'], label: 'Mute', action: 'mute' },
  { keys: ['T'], label: 'Theater mode', action: 'theater' },
  { keys: ['C'], label: 'Subtitles on / off', action: 'captions' },
  { keys: ['N'], label: 'Next episode', action: 'next' },
  { keys: ['P'], label: 'Previous episode', action: 'previous' },
  { keys: ['?'], label: 'This list', action: 'help' },
]

const KEY_NAMES: Record<string, string> = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→' }

/** Maps a keydown to an action; modifier combos (browser shortcuts) are left alone. */
export function keyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): Action | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  const name = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return SHORTCUTS.find((s) => s.keys.includes(name))?.action ?? null
}
