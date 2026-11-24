import { defineConfig, devices } from '@playwright/test'

/**
 * Production smoke: `next start` on an empty, never-seeded database. scripts/test-smoke.sh builds the
 * app first and exports the fake production env (ORIGIN_SECRET, SMOKE_DATABASE_URI, ...).
 */
const SMOKE_DATABASE_URI = process.env.SMOKE_DATABASE_URI ?? process.env.DATABASE_URI
if (!SMOKE_DATABASE_URI?.endsWith('/reyan_smoke')) {
  throw new Error('The smoke suite only runs against reyan_smoke; use pnpm test:smoke')
}

export default defineConfig({
  testDir: './tests/smoke',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3200',
    extraHTTPHeaders: { 'x-origin-secret': process.env.ORIGIN_SECRET ?? '' },
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  projects: [{ name: 'mobile' }],
  webServer: {
    command: 'pnpm start --port 3200',
    env: { DATABASE_URI: SMOKE_DATABASE_URI, NODE_ENV: 'production' },
    reuseExistingServer: false,
    timeout: 120_000,
    // Healthy only once the app booted, ran its migrations and reached the database
    url: 'http://localhost:3200/api/health',
  },
})
