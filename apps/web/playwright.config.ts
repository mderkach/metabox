import { defineConfig, devices } from '@playwright/test';

const CI = process.env.CI !== undefined;

// A port of its own, so a dev server already running on the default one is never taken for the stand.
const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.test.ts',
  fullyParallel: true,
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
  // Every request goes to the dev mocks (`METABOX_MOCK=all`): the stand needs no daemon.
  webServer: {
    command: `vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    env: { METABOX_MOCK: 'all' },
    reuseExistingServer: !CI,
  },
});
