import { setupServer } from 'msw/node';

/**
 * Starts empty: the test itself attaches handlers via `server.use(...)`.
 * `onUnhandledRequest: 'error'` in `setup.ts` turns a forgotten mock into a failure,
 * not into a silent network request.
 */
export const server = setupServer();
