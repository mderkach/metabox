import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';

import { createMissingHandlers } from '../src/test/handlers';
import { ROUTES_V11_CONFIG } from './routesV11';

/**
 * For checking failures by hand in dev mode, from the browser console:
 * `const m = await import('/mocks/browser.ts'); m.worker.use(m.http.get('/api/mcp', () => m.HttpResponse.json({}, { status: 500 })))`.
 * The handler must come from this msw instance, not from another import of the package.
 */
export { http, HttpResponse } from 'msw';
export { silenceRuntimeStream } from '../src/test/runtimeStream';

/**
 * The last handler fails every unmocked `/api/` request: the dev server proxies `/api` to
 * `METABOX_API_TARGET`, which may be a live daemon, and an error thrown from `onUnhandledRequest`
 * does not stop the request in the browser worker.
 */
const unmockedApi = http.all('/api/*', ({ request }) => {
  console.error(`[mocks] no mock for ${request.method} ${new URL(request.url).pathname}`);

  return HttpResponse.error();
});

const routesPreviews = new Map([
  ['routes-v11', ROUTES_V11_CONFIG],
  ['routes-v11-empty', {}],
]);
const routesPreview = routesPreviews.get(new URLSearchParams(window.location.search).get('mock') ?? '');

export const worker = setupWorker(...createMissingHandlers(__METABOX_MOCK_CONNECTIONS__, routesPreview), unmockedApi);
