import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';

import { createMissingHandlers } from '../src/test/handlers';

/**
 * For checking failures by hand in dev mode, from the browser console:
 * `const m = await import('/mocks/browser.ts'); m.worker.use(m.http.get('/api/mcp', () => m.HttpResponse.json({}, { status: 500 })))`.
 * The handler must come from this msw instance, not from another import of the package.
 */
export { http, HttpResponse } from 'msw';
export { silenceRuntimeStream } from '../src/test/runtimeStream';

// Throwing from onUnhandledRequest does not stop the browser worker from forwarding the request.
const unmockedApi = http.all('/api/*', ({ request }) => {
  console.error(`[mocks] no mock for ${request.method} ${new URL(request.url).pathname}`);

  return HttpResponse.error();
});

export const worker = setupWorker(...createMissingHandlers(__METABOX_MOCK_CONNECTIONS__), unmockedApi);
