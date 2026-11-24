import { expect, test } from '@playwright/test'
import { TOTP } from 'otpauth'
import pg from 'pg'
import { freshIp, PASSWORD, signedIn, signInWithPassword, signOut, signUp, uniqueEmail } from './helpers'

test('health: site, database and RECONSUMET.TS are up', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toMatchObject({ ok: true, database: { ok: true }, reconsumet: { ok: true } })
  expect(body.reconsumet.version).toMatch(/^\d+\.\d+\.\d+/)
  const csp = res.headers()['content-security-policy'] ?? ''
  expect(csp).toContain("frame-ancestors 'none'")
})

test('placeholder home shows real posters', async ({ page }) => {
  await page.goto('/')
  const posters = page.getByRole('region', { name: 'Picks' }).locator('img')
  await expect(posters.first()).toBeVisible()
  expect(await posters.count()).toBeGreaterThan(2)
  await expect
    .poll(() => posters.first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
})

test('header search shows real suggestions and works by keyboard', async ({ page }) => {
  await page.goto('/')
  const box = page.getByRole('combobox', { name: 'Search anime' })
  await box.fill('death note')
  const options = page.getByRole('option')
  await expect(options.first()).toContainText(/death note/i)
  await box.press('ArrowDown')
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/anime\/\d+/)
})

test('email: sign up → verify → sign out → sign in', async ({ page }) => {
  const email = uniqueEmail('email')
  await signUp(page, email)
  await page.getByRole('link', { name: 'Continue' }).click()
  await signedIn(page)
  await signOut(page)
  await signInWithPassword(page, email)
  await expect(page).toHaveURL(/\/$/)
  await signedIn(page)
})

test('2FA: TOTP on → sign in with a code → sign in with a backup code', async ({ page }) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('totp')
  await signUp(page, email)

  await page.goto('/settings/security')
  await page.getByRole('button', { name: 'Turn on' }).click()
  await page.getByRole('dialog').getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Continue' }).click()
  const secret = (await page.locator('code').first().textContent())?.trim() ?? ''
  const totp = new TOTP({ secret, digits: 6, period: 30 })
  await page.getByLabel('6-digit code').fill(totp.generate())
  await page.getByRole('dialog').getByRole('button', { name: 'Turn on' }).click()
  const list = page.getByRole('list', { name: 'Backup codes' })
  await expect(list).toBeVisible()
  const codes = await list.locator('li').allTextContents()
  expect(codes.length).toBeGreaterThan(4)
  await page.getByRole('button', { name: 'I saved them' }).click()

  await signOut(page)
  await signInWithPassword(page, email)
  await expect(page).toHaveURL(/\/two-factor/)
  await freshIp(page.context())
  // a fresh period, so the code isn't the one used while turning 2FA on
  await page.waitForTimeout(((30 - (Math.floor(Date.now() / 1000) % 30)) % 30) * 1000 + 1000)
  await page.getByLabel('6-digit code').fill(totp.generate())
  await page.getByRole('button', { name: 'Verify' }).click()
  await signedIn(page)

  await signOut(page)
  await signInWithPassword(page, email)
  await expect(page).toHaveURL(/\/two-factor/)
  await freshIp(page.context())
  await page.getByRole('tab', { name: 'Backup code' }).click()
  await page.getByRole('textbox', { name: 'Backup code' }).fill(codes[0]!.trim())
  await page.getByRole('button', { name: 'Verify' }).click()
  await signedIn(page)
})

test('passkey: add with a virtual authenticator → sign out → sign in with it', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const email = uniqueEmail('passkey')
  await signUp(page, email)
  await page.goto('/settings/security')
  await page.getByRole('button', { name: 'Add a passkey' }).click()
  await expect(page.getByText('Passkey added', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Passkeys' }).getByText(/ on /)).toBeVisible()

  await signOut(page)
  await freshIp(page.context())
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await signedIn(page)
})

test('guest progress moves into the account on sign-up', async ({ page }) => {
  const now = new Date().toISOString()
  await page.goto('/')
  await page.evaluate((updatedAt) => {
    localStorage.setItem(
      'guest:v1',
      JSON.stringify({
        progress: [{ anilistId: 1535, episode: 3, positionSec: 612, durationSec: 1420, completed: false, updatedAt }],
        list: [{ anilistId: 1535, status: 'watching', score: null, updatedAt }],
        settings: null,
      }),
    )
  }, now)
  const email = uniqueEmail('guest')
  await signUp(page, email)
  await expect(
    page.getByText('Your watch history from this browser is now in your account', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('guest:v1'))).toBeNull()

  test.skip(!process.env.E2E_DATABASE_URL, 'set E2E_DATABASE_URL to also check the rows')
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL })
  await db.connect()
  try {
    const { rows } = await db.query(
      `SELECT w."anilistId", w.episode, w."positionSec" FROM watch_progress w JOIN "user" u ON u.id = w."userId" WHERE u.email = $1`,
      [email],
    )
    expect(rows).toEqual([{ anilistId: 1535, episode: 3, positionSec: 612 }])
    const list = await db.query(
      `SELECT l.status FROM list_entry l JOIN "user" u ON u.id = l."userId" WHERE u.email = $1`,
      [email],
    )
    expect(list.rows).toEqual([{ status: 'watching' }])
  } finally {
    await db.end()
  }
})
