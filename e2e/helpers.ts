import { type BrowserContext, expect, type Page } from '@playwright/test'

const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'

/**
 * The e2e stack trusts X-Forwarded-For from any peer (TRUSTED_PROXIES=0.0.0.0/0), so each step can look like a new
 * visitor and Better Auth's sign-in rate limit (3 per 10 s per IP) doesn't trip the suite.
 */
export async function freshIp(context: BrowserContext) {
  const n = () => Math.floor(Math.random() * 250) + 1
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.18.${n()}.${n()}` })
}

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
export const PASSWORD = 'correct-horse-battery-staple-e2e'

/** Waits for the newest email to `to` in Mailpit and returns the first link in it. */
export async function linkFromEmail(to: string, subject: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] }
    const m = messages.find((x) => subject.test(x.Subject))
    if (m) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string }
      const link = msg.Text.match(/https?:\/\/\S+/)?.[0]
      if (link) return link
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`no email "${subject}" for ${to}`)
}

/** Email sign-up + verification link → signed in. */
export async function signUp(page: Page, email: string, name = 'E2E Tester') {
  await freshIp(page.context())
  await page.goto('/sign-up')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/verify-email\?sent=/)
  await page.goto(await linkFromEmail(email, /Confirm your email/))
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()
}

export async function signOut(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Your account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
}

export async function signInWithPassword(page: Page, email: string) {
  await freshIp(page.context())
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

export const signedIn = (page: Page) => expect(page.getByRole('button', { name: 'Your account' })).toBeVisible()
