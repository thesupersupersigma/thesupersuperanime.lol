import { expect, it } from 'vitest'
import { sanitizeDescription } from './sanitize'

it("keeps AniList's basic tags", () => {
  expect(sanitizeDescription('An elf.<br><br><i>(Source: Crunchyroll)</i>')).toBe(
    'An elf.<br /><br /><i>(Source: Crunchyroll)</i>',
  )
})

it('drops scripts, handlers, styles, images and javascript: links', () => {
  const out = sanitizeDescription(
    '<p onclick="x()" style="color:red">Hi<script>alert(1)</script><img src=x onerror=alert(1)>' +
      '<a href="javascript:alert(1)">bad</a><iframe src="https://evil"></iframe></p>',
  )
  expect(out).toBe('<p>Hi<a rel="noopener noreferrer nofollow" target="_blank">bad</a></p>')
})

it('opens real links safely in a new tab', () => {
  expect(sanitizeDescription('<a href="https://anilist.co/x" onmouseover="y">x</a>')).toBe(
    '<a href="https://anilist.co/x" rel="noopener noreferrer nofollow" target="_blank">x</a>',
  )
})

it('turns empty or missing text into null', () => {
  expect(sanitizeDescription(null)).toBeNull()
  expect(sanitizeDescription('<script>x</script>')).toBeNull()
})
