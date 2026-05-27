import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for age-web-gateway UI tests.
 *
 * The webServer directive starts a lightweight Node.js HTTP server (server.mjs)
 * that serves the pre-built frontend from web/dist/ and substitutes the
 * Go-injected template tokens (e.g. __POW_DIFFICULTY__) with safe test values.
 *
 * Before running tests, build the frontend:
 *   cd web && npm ci --ignore-scripts && node build.mjs
 *
 * Then run tests from the e2e/ directory:
 *   npm install && npx playwright install chromium
 *   npm test
 */
export default defineConfig({
  testDir: './tests',

  // Each spec file runs fully in parallel; tests within a file run in order.
  fullyParallel: true,

  // Fail the build on CI if test.only is accidentally left in.
  forbidOnly: !!process.env.CI,

  // Retry failed tests twice on CI to smooth over flakiness.
  retries: process.env.CI ? 2 : 0,

  // Use a single worker on CI; locally use all cores.
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    // Keep tests independent; reset state between each test via fresh contexts.
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'node server.mjs',
    url: 'http://localhost:4321',
    // Reuse an already-running server during local dev; always start fresh on CI.
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
