import { setupWorker } from 'msw/browser';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Starts empty: the test attaches handlers via `worker.use(...)`, the browser counterpart of
 * `server.use(...)`. A request without a handler fails, as it does in the jsdom setup.
 */
export const worker = setupWorker();

beforeAll(async () => {
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    quiet: true,
    onUnhandledRequest: 'error',
  });
});

afterEach(() => {
  worker.resetHandlers();
});

afterAll(() => {
  worker.stop();
});
