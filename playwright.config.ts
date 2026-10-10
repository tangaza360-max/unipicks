import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: the real app on http://127.0.0.1:4000, talking to a FAKE
// Supabase that lives inside the test (tests/e2e/support/fake-supabase.ts).
// They never touch the real database.
//
// Safety: the app is built into .e2e-dist with VITE_SUPABASE_URL pointing at
// the fake (these values win over .env), and a server already running on port
// 4000 is never reused — it could be `npm run dev` connected to production.
//
// Run: npm run test:e2e   (report: npx playwright show-report)
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Normally Playwright's own browser (`npx playwright install chromium`).
    // PW_CHROMIUM_PATH points at another Chromium, e.g. on a machine that
    // already has one installed.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    // Students use phones first: a Pixel 7-sized Chrome.
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite build --outDir .e2e-dist --emptyOutDir && npx vite preview --outDir .e2e-dist --host 127.0.0.1 --port 4000 --strictPort',
    url: 'http://127.0.0.1:4000',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'http://fake-supabase.test',
      VITE_SUPABASE_ANON_KEY: 'fake-anon-key',
      VITE_SENTRY_DSN: '',
    },
  },
})
