import { defineConfig, devices } from '@playwright/test';

const CI = process.env.CI !== undefined;
// `METABOX_E2E_STAND=live` points the panel at the bench daemon from `METABOX_API_TARGET` instead of the mocks.
const LIVE = process.env.METABOX_E2E_STAND === 'live';

// A port of its own, so a dev server already running on the default one is never taken for the stand.
const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.test.ts',
  // The daemon state is shared: scenarios on it must not apply edits at the same time.
  fullyParallel: !LIVE,
  workers: LIVE ? 1 : undefined,
  forbidOnly: CI,
  // The retry is there for its trace: a test that passes only on it still fails the run.
  retries: CI ? 1 : 0,
  failOnFlakyTests: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // The panel picks its language from the browser: scenarios read the English dictionaries.
    locale: 'en-US',
    // The apply bar and the side panel skip their transitions, so a click never lands on a moving target.
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // A real Apply restarts sing-box, which takes longer than the default five seconds.
  expect: LIVE ? { timeout: 30_000 } : {},
  timeout: LIVE ? 120_000 : undefined,
  // On the mock stand every request goes to the dev mocks (`METABOX_MOCK=all`) and no daemon is needed.
  webServer: {
    command: `vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    env: LIVE ? {} : { METABOX_MOCK: 'all' },
    reuseExistingServer: !CI,
  },
});
