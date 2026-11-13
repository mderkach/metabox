import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import type { ProxyOptions, ViteDevServer } from 'vite';
import { configDefaults, defineConfig, type Plugin } from 'vitest/config';

import { metaboxI18n } from './tools/i18nPlugin.ts';

const BUDGET_TESTS = 'src/**/*.budget.test.{ts,tsx}';
const BROWSER_TESTS = 'src/**/*.browser.test.{ts,tsx}';

// Inline projects inherit the root `test` and merge `setupFiles`, so the jsdom setup is
// given to its projects only: the browser one has no `msw/node` and needs no jsdom stubs.
const JSDOM_PROJECT = { environment: 'jsdom', setupFiles: './src/test/setup.ts' } as const;

// FSD layers; the same list is in `paths` of both tsconfigs.
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

const APP_ENTRY = '/src/app/main.tsx';
const MOCK_ENTRY = '/mocks/enable.ts';
const WORKER_PATH = '/mockServiceWorker.js';

/**
 * Daemon mocks. Enabled by `METABOX_MOCK=all` and live
 * only on the dev server: `apply: 'serve'` keeps the plugin out of the build,
 * so a substituted entry never ends up in `dist`.
 *
 * `METABOX_MOCK_CONNECTIONS=<number>` inflates the connection snapshot to the given
 * size: the panel must hold five thousand live connections (NFR-2), and
 * there is no other way to check this by hand — the test bench never has that much traffic.
 *
 * The worker script is served from `node_modules`, not put in `public/`: a file in
 * `public/` would go into `dist`, and from there via `go:embed` into the daemon binary.
 */
function metaboxMocks(): Plugin | false {
  if (process.env.METABOX_MOCK !== 'all') {
    return false;
  }

  return {
    name: 'metabox-mocks',
    apply: 'serve',
    config: () => ({
      define: {
        __METABOX_MOCK_CONNECTIONS__: JSON.stringify(Number(process.env.METABOX_MOCK_CONNECTIONS ?? 0)),
      },
    }),
    configureServer: serveMockWorker,
    transformIndexHtml: (html) => html.replace(APP_ENTRY, MOCK_ENTRY),
  };
}

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
function metaboxTestMocks(): Plugin {
  return { name: 'metabox-test-mocks', configureServer: serveMockWorker };
}

const SCAN_ENTRY = '/dev/scan.ts';

/**
 * Re-render capture by react-scan. Enabled by `METABOX_SCAN=1` and lives only on the
 * dev server: `apply: 'serve'` keeps the plugin out of the build, and
 * render instrumentation costs time and must not get into the NFR-2 measurement.
 *
 * The script goes into `head` — before the app entry: bippy replaces the devtools
 * hook, and before the first React render that is no longer possible.
 */
function metaboxScan(): Plugin | false {
  if (process.env.METABOX_SCAN !== '1') {
    return false;
  }

  return {
    name: 'metabox-scan',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace('</head>', `  <script type="module" src="${SCAN_ENTRY}"></script>\n  </head>`),
  };
}

/** What to compress: the rest is either already compressed (woff2) or smaller than a response header. */
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg']);
const MIN_COMPRESS_BYTES = 256;
/** Below this gain a second file in the binary does not pay off. */
const MIN_COMPRESS_RATIO = 0.9;

/**
 * Pre-compression of static files. The daemon has no compressor and should not: compressing the
 * same file on every request is router CPU time wasted. The build puts `.br` and `.gz` next to it,
 * and the daemon picks by `Accept-Encoding`.
 *
 * Both formats, not only brotli: browsers do not advertise `br` on every
 * connection, and the panel lives on plain http in the local network.
 */
function metaboxCompress(): Plugin {
  let outDir = 'dist';

  return {
    name: 'metabox-compress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const file of walk(outDir)) {
        if (!COMPRESSIBLE.has(path.extname(file))) {
          continue;
        }

        const raw = readFileSync(file);

        if (raw.byteLength < MIN_COMPRESS_BYTES) {
          continue;
        }

        writeIfSmaller(
          `${file}.br`,
          raw,
          brotliCompressSync(raw, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
              [constants.BROTLI_PARAM_SIZE_HINT]: raw.byteLength,
            },
          })
        );
        writeIfSmaller(`${file}.gz`, raw, gzipSync(raw, { level: 9 }));
      }
    },
  };
}

function writeIfSmaller(target: string, raw: Buffer, compressed: Buffer) {
  if (compressed.byteLength < raw.byteLength * MIN_COMPRESS_RATIO) {
    writeFileSync(target, compressed);
  }
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

const daemonTarget = process.env.METABOX_API_TARGET ?? 'http://127.0.0.1:8080';

// changeOrigin replaces only Host, while the daemon checks Origin against the panel address and
// rejects any mutating request without a match. The dev server presents itself as
// the daemon itself — otherwise the daemon would have to open a foreign origin.
const sendDaemonOrigin: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyReq', (request) => {
    request.setHeader('origin', daemonTarget);
  });
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), metaboxI18n(import.meta.dirname), metaboxCompress(), metaboxMocks(), metaboxScan()],
  resolve: {
    alias: {
      ...Object.fromEntries(LAYERS.map((layer) => [`@${layer}`, path.resolve(import.meta.dirname, `./src/${layer}`)])),
      // Test harness: not a layer, but tests inside layers reach it by alias.
      '@test': path.resolve(import.meta.dirname, './src/test'),
    },
  },
  server: {
    // Listening on loopback in a container is useless — the port is not visible from outside.
    host: true,
    // The HMR payload goes over the same port as the page;
    // without an explicit setting the browser client tries to reach the container host.
    watch: { usePolling: false },
    proxy: {
      // The daemon lives in the target environment (the target container), not next to the dev server.
      // With -https the daemon certificate comes from its own root, which the dev machine
      // does not trust; the proxy talks to such a daemon without checking it.
      '/api': {
        target: daemonTarget,
        changeOrigin: true,
        secure: false,
        configure: sendDaemonOrigin,
        // The connection and traffic stream goes under the same prefix: without this
        // the WebSocket upgrade hits the dev server, not the daemon.
        ws: true,
      },
      '/healthz': {
        target: daemonTarget,
        changeOrigin: true,
        secure: false,
        configure: sendDaemonOrigin,
      },
    },
  },
  test: {
    // Budget measurements run as a separate group after the rest, one file at a time:
    // parallel neighbours take the CPU, and the measurement on a CI runner goes over the threshold.
    projects: [
      {
        test: {
          name: 'tooling',
          environment: 'node',
          include: ['tools/**/*.test.js'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          ...JSDOM_PROJECT,
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, BUDGET_TESTS, BROWSER_TESTS],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          ...JSDOM_PROJECT,
          name: 'budget',
          include: [BUDGET_TESTS],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        plugins: [metaboxTestMocks()],
        test: {
          name: 'browser',
          include: [BROWSER_TESTS],
          setupFiles: './src/test/browserSetup.ts',
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
