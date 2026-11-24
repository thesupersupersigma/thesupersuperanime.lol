import { describe, expect, it } from 'vitest'
import { errorText, safeNext } from './auth-ui'

describe('safeNext', () => {
  it('keeps same-site paths and refuses other sites', () => {
    expect(safeNext('/settings')).toBe('/settings')
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', null, ''])
      expect(safeNext(bad)).toBe('/')
  })
})

describe('errorText', () => {
  it('maps codes and rate limits to plain English', () => {
    expect(errorText({ code: 'PASSWORD_COMPROMISED' })).toMatch(/breach/)
    expect(errorText({ status: 429 })).toMatch(/Too many/)
    expect(errorText(null)).toBeNull()
  })
})
