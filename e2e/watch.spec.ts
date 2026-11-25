import { expect, type Page, test } from '@playwright/test'
import pg from 'pg'
import { signUp, uniqueEmail } from './helpers'

// The watch path against real sources. Frieren (AniList 154587) is on Re:Anime with sub + dub, styled (ASS)
// subtitles and the server's own intro/outro times. Video is kept short: the relay shares the server's upload.
const ID = 154587
const video = (page: Page) => page.locator('section[aria-label="Video player"] video')
const now = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime)

/** Waits until the player has media, starts it, and returns once time is moving. */
async function play(page: Page) {
  await expect(video(page)).toBeAttached({ timeout: 60_000 })
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 60_000 })
    .toBeGreaterThan(0)
  await video(page).evaluate((v: HTMLVideoElement) => v.play())
}
async function seek(page: Page, t: number) {
  await video(page).evaluate((v: HTMLVideoElement, t) => {
    v.currentTime = t
  }, t)
}
async function serverButton(page: Page, audio: 'SUB' | 'DUB', nth = 0) {
  const row = page.getByRole('region', { name: 'Servers' }).locator('div.flex-wrap', { hasText: audio }).first()
  return row.getByRole('button').nth(nth)
}

test.describe.configure({ mode: 'serial', timeout: 150_000 })

// No fake X-Forwarded-For here (helpers.freshIp): Playwright adds extra headers to *every* request, which turns the
// cross-origin HLS requests to the relay into CORS preflights. The per-IP limits leave room for this suite.

test('search → anime page → episode 1 plays through the relay', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Search anime' }).fill('frieren')
  await page.getByRole('combobox', { name: 'Search anime' }).press('Enter')
  await expect(page).toHaveURL(/\/search\?q=frieren/)
  await page.locator(`a[href="/anime/${ID}"]`).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Frieren/)
  await page.getByRole('link', { name: /^Watch · EP 1/ }).click()
  await expect(page).toHaveURL(`/watch/${ID}/1`)
  await play(page)
  const t0 = await now(page)
  await expect.poll(() => now(page), { timeout: 30_000 }).toBeGreaterThan(t0 + 3)
  const src = await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)
  expect(src.startsWith('blob:') || !src.includes('flixcloud')).toBe(true) // MSE blob, never a third-party URL
})

test('styled (ASS) subtitles are drawn by JASSUB', async ({ page }) => {
  await page.goto(`/watch/${ID}/1`)
  await play(page)
  await expect(page.locator('canvas.JASSUB')).toBeAttached()
  await expect
    .poll(() => page.locator('canvas.JASSUB').evaluate((c: HTMLCanvasElement) => c.width), { timeout: 20_000 })
    .toBeGreaterThan(300)
  // the canvas is an OffscreenCanvas in a worker, so look at pixels: hide the video, compare subtitles on vs off
  const player = page.getByRole('region', { name: 'Video player' })
  await video(page).evaluate((v: HTMLVideoElement) => {
    v.style.visibility = 'hidden'
    v.pause()
  })
  let drew = false
  for (const t of [120, 150, 200, 260, 320, 400]) {
    await seek(page, t)
    await page.waitForTimeout(1500)
    const on = (await player.screenshot()).length
    await page.locator('canvas.JASSUB').evaluate((c: HTMLCanvasElement) => {
      c.style.visibility = 'hidden'
    })
    const off = (await player.screenshot()).length
    await page.locator('canvas.JASSUB').evaluate((c: HTMLCanvasElement) => {
      c.style.visibility = ''
    })
    if (on > off + 1500) {
      drew = true
      break
    }
  }
  expect(drew, 'some subtitle line was drawn on the JASSUB canvas').toBe(true)
})

test('switching server and SUB ↔ DUB keeps the time; skip intro works', async ({ page }) => {
  await page.goto(`/watch/${ID}/1`)
  await play(page)
  // the server's own intro is 0–90 s
  await seek(page, 5)
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await expect.poll(() => now(page)).toBeGreaterThan(88)

  await seek(page, 300)
  await page.waitForTimeout(1500)
  for (const [audio, nth] of [
    ['SUB', 1],
    ['DUB', 0],
    ['SUB', 0],
  ] as const) {
    const before = await now(page)
    const src = await video(page).evaluate((v: HTMLVideoElement) => v.src || v.currentSrc)
    await (await serverButton(page, audio, nth)).click()
    await expect(await serverButton(page, audio, nth)).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.src || v.currentSrc), { timeout: 30_000 })
      .not.toBe(src)
    await expect
      .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 45_000 })
      .toBeGreaterThan(0)
    await expect.poll(async () => Math.abs((await now(page)) - before), { timeout: 30_000 }).toBeLessThan(3 + 4)
  }
})

test('guest: progress in localStorage, resume prompt after reload', async ({ page }) => {
  await page.goto(`/watch/${ID}/1`)
  await play(page)
  await seek(page, 400)
  await page.waitForTimeout(1500)
  await video(page).evaluate((v: HTMLVideoElement) => v.pause()) // pause saves
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = JSON.parse(localStorage.getItem('guest:v1') ?? '{}')
        return g.progress?.find((p: { episode: number }) => p.episode === 1)?.positionSec ?? 0
      }),
    )
    .toBeGreaterThan(390)
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Resume' })).toContainText(/Continue from 6:4\d/, { timeout: 60_000 })
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect.poll(() => now(page)).toBeGreaterThan(395)
})

test('up next counts down near the end and opens episode 2; shortcuts work', async ({ page }) => {
  await page.goto(`/watch/${ID}/1`)
  await play(page)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  const t = await now(page)
  await page.locator('body').press('l')
  await expect.poll(() => now(page)).toBeGreaterThan(t + 8)
  await page.locator('body').press('t')
  await expect(page.getByRole('switch', { name: 'Theater' })).toHaveAttribute('aria-checked', 'true')
  await page.locator('body').press('k')
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await page.locator('body').press('k')

  // the server's outro starts at 1459 s: the card shows from there and counts 10 s
  const d = await video(page).evaluate((v: HTMLVideoElement) => v.duration)
  await seek(page, Math.min(1462, d - 30))
  await expect(page.getByText('Up next')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('svg[data-ring]')).toBeVisible()
  await expect(page).toHaveURL(`/watch/${ID}/2`, { timeout: 30_000 })
})

test('signed in: progress is saved to the database', async ({ page }) => {
  test.skip(!process.env.E2E_DATABASE_URL, 'set E2E_DATABASE_URL to check the rows')
  const email = uniqueEmail('watch')
  await signUp(page, email)
  await page.context().setExtraHTTPHeaders({}) // signUp sets a fake client IP; see the note at the top
  await page.goto(`/watch/${ID}/3`)
  await play(page)
  await seek(page, 250)
  await page.waitForTimeout(1500)
  await video(page).evaluate((v: HTMLVideoElement) => v.pause())
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL })
  await db.connect()
  try {
    await expect
      .poll(
        async () =>
          (
            await db.query(
              `select p."positionSec" from watch_progress p join "user" u on u.id = p."userId" where u.email = $1 and p."anilistId" = $2 and p.episode = 3`,
              [email, ID],
            )
          ).rows[0]?.positionSec ?? 0,
        { timeout: 20_000 },
      )
      .toBeGreaterThan(240)
  } finally {
    await db.end()
  }
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('no poster tilt and no countdown ring', async ({ page }) => {
    await page.goto(`/anime/${ID}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('[data-tilt]')).toHaveCount(0)
    await page.goto(`/watch/${ID}/1`)
    await play(page)
    const d = await video(page).evaluate((v: HTMLVideoElement) => v.duration)
    await seek(page, Math.min(1462, d - 30))
    await expect(page.getByText('Up next')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('svg[data-ring]')).toHaveCount(0)
  })
})
