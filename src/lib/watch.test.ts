import { describe, expect, it } from 'vitest'
import { chooseSkip, keyAction, nextServer, type Server, srtToVtt } from './watch'

const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  keyAction({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods })

describe('keyAction', () => {
  it('maps the shortcut keys, case-insensitively', () => {
    expect(k(' ')).toBe('toggle-play')
    expect(k('k')).toBe('toggle-play')
    expect(k('J')).toBe('back-10')
    expect(k('l')).toBe('forward-10')
    expect(k('ArrowLeft')).toBe('back-5')
    expect(k('ArrowRight')).toBe('forward-5')
    expect(k('f')).toBe('fullscreen')
    expect(k('m')).toBe('mute')
    expect(k('t')).toBe('theater')
    expect(k('c')).toBe('captions')
    expect(k('n')).toBe('next')
    expect(k('p')).toBe('previous')
    expect(k('?')).toBe('help')
  })
  it('ignores other keys and modifier combos', () => {
    expect(k('x')).toBeNull()
    expect(k('ArrowUp')).toBeNull()
    expect(k('f', { ctrlKey: true })).toBeNull()
    expect(k('k', { metaKey: true })).toBeNull()
  })
})

describe('srtToVtt', () => {
  it('adds the header and swaps decimal commas, keeping cue text', () => {
    const srt = '﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nHello, world\r\n'
    expect(srtToVtt(srt)).toBe('WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nHello, world\n')
  })
})

describe('chooseSkip', () => {
  it("prefers the server's times, fills gaps from AniSkip, drops nonsense", () => {
    expect(
      chooseSkip({ intro: { start: 0, end: 90 } }, { intro: { start: 5, end: 95 }, outro: { start: 1300, end: 1390 } }),
    ).toEqual({
      intro: { start: 0, end: 90 },
      outro: { start: 1300, end: 1390 },
    })
    expect(chooseSkip({ intro: { start: 50, end: 10 } }, null)).toEqual({ intro: undefined, outro: undefined })
  })
})

describe('nextServer', () => {
  const s = (key: string, audio: 'sub' | 'dub'): Server => ({
    key,
    audio,
    source: 'x',
    name: key,
    url: '',
    type: 'hls',
    subtitles: [],
  })
  const list = [s('a', 'sub'), s('b', 'dub'), s('c', 'sub'), s('d', 'sub')]
  it('tries the same audio first, skipping ones that failed, then any other', () => {
    expect(nextServer(list, list[0] as Server, new Set(['a']))?.key).toBe('c')
    expect(nextServer(list, list[2] as Server, new Set(['a', 'c']))?.key).toBe('d')
    expect(nextServer(list, list[3] as Server, new Set(['a', 'c', 'd']))?.key).toBe('b')
    expect(nextServer(list, list[1] as Server, new Set(['a', 'b', 'c', 'd']))).toBeUndefined()
  })
})
