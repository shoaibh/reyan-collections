import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

import { testDbUri } from './tests/helpers/testDbUri'

const TEST_DATABASE_URI = testDbUri()
// Seed helpers and the test server both run against the test database
process.env.DATABASE_URI = TEST_DATABASE_URI

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  // e2e tests mutate shared seeded data, so they run one at a time
  fullyParallel: false,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3100',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // The storefront journey is mobile-only (later tasks assert 390px layout)
      testIgnore: /(^|[\\/])storefront\.e2e\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
    {
      name: 'mobile',
      testMatch: /(^|[\\/])storefront\.e2e\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'pnpm dev --port 3100',
    env: { DATABASE_URI: TEST_DATABASE_URI },
    reuseExistingServer: !process.env.CI,
    // A cold start (no .next/dev cache) can exceed the 60s default on a busy machine
    timeout: 180_000,
    // A static asset: readiness polling must not open DB connections before global setup resets the DB
    url: 'http://localhost:3100/brand/logo-mark.png',
  },
})
