import { defineConfig, devices } from '@playwright/test'

// Runs against a running stack (see e2e/README.md): E2E_BASE_URL (default http://localhost:3000),
// E2E_MAILPIT_URL (default http://localhost:8025) and optionally E2E_DATABASE_URL for database assertions.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
