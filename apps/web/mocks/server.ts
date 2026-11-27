import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin, ViteDevServer } from 'vite';

const APP_ENTRY = '/src/app/main.tsx';
const MOCK_ENTRY = '/mocks/enable.ts';
const WORKER_PATH = '/mockServiceWorker.js';
const SERVICE_UNAVAILABLE = 503;

// Serving the installed worker here keeps it out of the embedded production panel.
function serveMockWorker(server: ViteDevServer) {
  const require = createRequire(import.meta.url);
  const worker = path.join(path.dirname(require.resolve('msw/package.json')), 'lib/mockServiceWorker.js');

  server.middlewares.use(WORKER_PATH, (_request, response) => {
    response.setHeader('Content-Type', 'text/javascript');
    response.setHeader('Service-Worker-Allowed', '/');
    response.end(readFileSync(worker, 'utf8'));
  });
}

/** The same worker script for browser tests: they answer the panel's requests with the dev mocks. */
export function metaboxTestMocks(): Plugin {
  return { name: 'metabox-test-mocks', configureServer: serveMockWorker };
}

export function metaboxMocks(): Plugin {
  return {
    name: 'metabox-mocks',
    apply: 'serve',
    config: () => ({
      define: {
        __METABOX_MOCK_CONNECTIONS__: JSON.stringify(Number(process.env.METABOX_MOCK_CONNECTIONS ?? 0)),
      },
    }),
    configureServer(server) {
      serveMockWorker(server);

      for (const route of ['/api', '/healthz']) {
        server.middlewares.use(route, (_request, response) => {
          response.writeHead(SERVICE_UNAVAILABLE, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(
            JSON.stringify({
              code: 'mock_worker_required',
              message: 'Open or reload the panel on localhost to activate the mock service worker.',
            })
          );
        });
      }
    },
    transformIndexHtml: (html) => html.replace(APP_ENTRY, MOCK_ENTRY),
  };
}
