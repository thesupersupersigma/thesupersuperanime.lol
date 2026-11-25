import { beforeAll, describe, expect, it } from 'vitest'

describe('buildCsp', () => {
  let buildCsp: (nonce: string, dev: boolean) => string
  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgres://x',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      SITE_URL: 'https://anime.example.com',
      RELAY_PUBLIC_URL: 'https://relay.example.com',
      DISCORD_CLIENT_ID: 'a',
      DISCORD_CLIENT_SECRET: 'b',
    })
    ;({ buildCsp } = await import('./proxy'))
  })

  it('locks scripts to the nonce and framing to nobody', () => {
    const csp = buildCsp('abc', false)
    expect(csp).toContain(`script-src 'self' 'nonce-abc' 'strict-dynamic' 'wasm-unsafe-eval'`)
    expect(csp).not.toContain(`'unsafe-eval'`)
    expect(csp).toContain(`frame-ancestors 'none'`)
    // the trailer dialog is the only frame
    expect(csp).toContain('frame-src https://www.youtube-nocookie.com;')
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('allows the relay for media and enabled providers for avatars only', () => {
    const csp = buildCsp('abc', false)
    expect(csp).toContain(`media-src 'self' blob: https://relay.example.com`)
    expect(csp).toContain('https://cdn.discordapp.com')
    expect(csp).not.toContain('googleusercontent')
  })
})
