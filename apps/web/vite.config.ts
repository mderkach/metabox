import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import type { ProxyOptions } from 'vite';
import { configDefaults, defineConfig, type Plugin } from 'vitest/config';

import { metaboxMocks, metaboxTestMocks } from './mocks/server.ts';
import { daemonOriginFor } from './tools/daemonOrigin.ts';
import { metaboxI18n } from './tools/i18nPlugin.ts';
import { metaboxLocalePreloads } from './tools/i18nPreload.ts';

const BUDGET_TESTS = 'src/**/*.budget.test.{ts,tsx}';
const BROWSER_TESTS = 'src/**/*.browser.test.{ts,tsx}';

// Inline projects inherit the root `test` and merge `setupFiles`, so the jsdom setup is
// given to its projects only: the browser one has no `msw/node` and needs no jsdom stubs.
// The 5 s default fails form and router tests on a loaded machine while each passes alone;
// 15 s matches what Vitest gives browser tests.
const JSDOM_PROJECT = { environment: 'jsdom', setupFiles: './src/test/setup.ts', testTimeout: 15_000 } as const;

// FSD layers; the same list is in `paths` of both tsconfigs.
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

const MOCK_DAEMON = process.env.METABOX_MOCK === 'all';

const PRODUCTION_ENV = { 'process.env.NODE_ENV': JSON.stringify('production') };

/**
 * The production build of React on the dev server. Enabled by `METABOX_REACT=production` and
 * lives only on the dev server, for timing the panel on the mock stand: the development build
 * renders several times slower, with `StrictMode` double renders.
 *
 * The prebundled dependencies get a cache directory of their own, so they never mix with the
 * development ones.
 */
function metaboxProductionReact(): Plugin | false {
  if (process.env.METABOX_REACT !== 'production') {
    return false;
  }

  return {
    name: 'metabox-production-react',
    apply: 'serve',
    config: () => ({
      cacheDir: 'node_modules/.vite-production-react',
      define: PRODUCTION_ENV,
      oxc: { jsx: { development: false, refresh: false } },
      optimizeDeps: { rolldownOptions: { transform: { define: PRODUCTION_ENV } } },
    }),
  };
}

const SCAN_ENTRY = '/dev/scan.ts';

/**
 * Re-render capture by react-scan. Enabled by `METABOX_SCAN=1` and lives only on the
 * dev server: `apply: 'serve'` keeps the plugin out of the build, and
 * render instrumentation costs time and must not get into the five-thousand-connection measurement.
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
// the daemon itself, but only for the panel's own requests: a foreign Origin goes through
// as is and the daemon refuses it.
const sendDaemonOrigin: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyReq', (request, incoming) => {
    const origin = daemonOriginFor(incoming.headers.origin, incoming.headers.host, daemonTarget);

    if (origin !== undefined) {
      request.setHeader('origin', origin);
    }
  });
};

// The test bench can use a daemon certificate signed by its own root.
const daemonProxy: ProxyOptions = {
  target: daemonTarget,
  changeOrigin: true,
  secure: false,
  configure: sendDaemonOrigin,
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    metaboxI18n(import.meta.dirname),
    metaboxLocalePreloads(import.meta.dirname),
    metaboxCompress(),
    MOCK_DAEMON && metaboxMocks(),
    metaboxProductionReact(),
    metaboxScan(),
  ],
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
    proxy: MOCK_DAEMON ? undefined : { '/api': daemonProxy, '/healthz': daemonProxy },
  },
  test: {
    // A local run shares the machine with the dev server and parallel agents; a CI runner is free.
    maxWorkers: process.env.CI === 'true' ? undefined : '50%',
    // Budget measurements run as a separate group after the rest, one file at a time:
    // parallel neighbours take the CPU, and the measurement on a CI runner goes over the threshold.
    projects: [
      {
        test: {
          name: 'tooling',
          environment: 'node',
          include: ['tools/**/*.test.{js,ts}'],
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
