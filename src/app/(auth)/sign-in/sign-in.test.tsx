import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { enabledMethods, parseConfig } from '@/config/schema'
import { SignInForm } from './sign-in-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  useSearchParams: () => new URLSearchParams(),
}))

const base = { DATABASE_URL: 'postgres://x', BETTER_AUTH_SECRET: 'x'.repeat(32) }
const page = (env: Record<string, string>) =>
  renderToStaticMarkup(<SignInForm methods={enabledMethods(parseConfig({ ...base, ...env }))} canReset={false} />)

describe('sign-in page', () => {
  it('lists exactly the configured providers', () => {
    const html = page({
      GITHUB_CLIENT_ID: 'a',
      GITHUB_CLIENT_SECRET: 'b',
      GOOGLE_CLIENT_ID: 'c',
      GOOGLE_CLIENT_SECRET: 'd',
    })
    expect(html).toContain('Continue with GitHub')
    expect(html).toContain('Continue with Google')
    expect(html).not.toContain('Continue with Discord')
    expect(html).not.toContain('Continue with Microsoft')
    expect(html).not.toContain('name="password"') // email + password is off without SMTP / AUTH_EMAIL_ALLOW_UNVERIFIED
  })

  it('shows the password form only when email sign-in is on', () => {
    const html = page({ AUTH_EMAIL_ALLOW_UNVERIFIED: 'true' })
    expect(html).toContain('name="password"')
    expect(html).not.toContain('Continue with')
  })
})
