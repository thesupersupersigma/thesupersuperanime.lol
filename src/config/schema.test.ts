import { describe, expect, it } from 'vitest'
import { enabledMethods, parseConfig } from './schema'

const base = { DATABASE_URL: 'postgres://x', BETTER_AUTH_SECRET: 'x'.repeat(32) }

describe('parseConfig', () => {
  it('uses neutral defaults and treats empty strings as unset', () => {
    const c = parseConfig({ ...base, SITE_NAME: '', SITE_URL: '' })
    expect(c.site.name).toBe('Anime')
    expect(c.site.url).toBe('http://localhost:3000')
    expect(c.reconsumet.url).toBe('http://localhost:8080')
    expect(c.smtp).toBeNull()
  })

  it('lists every missing or invalid variable at once', () => {
    expect(() => parseConfig({ SITE_URL: 'nope' })).toThrow(/SITE_URL[\s\S]*DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/)
  })

  it('turns each login method on only when configured', () => {
    expect(enabledMethods(parseConfig(base))).toEqual({ email: false, social: [] })
    const c = parseConfig({
      ...base,
      DISCORD_CLIENT_ID: 'a',
      DISCORD_CLIENT_SECRET: 'b',
      MICROSOFT_CLIENT_ID: 'c',
      MICROSOFT_CLIENT_SECRET: 'd',
      AUTH_EMAIL_ALLOW_UNVERIFIED: 'true',
    })
    expect(enabledMethods(c)).toEqual({ email: true, social: ['discord', 'microsoft'] })
    expect(c.auth.microsoftTenantId).toBe('common')
  })

  it('enables email via SMTP and derives secure from port 465', () => {
    const c = parseConfig({ ...base, SMTP_HOST: 'mail', SMTP_PORT: '465', SMTP_FROM: 'A <a@example.com>' })
    expect(c.auth.email).toBe(true)
    expect(c.smtp).toMatchObject({ port: 465, secure: true })
  })

  it('rejects half-configured providers and SMTP without a sender', () => {
    expect(() => parseConfig({ ...base, GITHUB_CLIENT_ID: 'a', SMTP_HOST: 'mail' })).toThrow(
      /GITHUB_CLIENT_ID[\s\S]*SMTP_FROM/,
    )
  })
})
