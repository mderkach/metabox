import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';
import { configDefaults, defineConfig, type Plugin } from 'vitest/config';

import { LOCALE_ROOT, checkLocales, collectLocales, hashedLocaleUrl, localeKey, writeI18nTypes } from './tools/i18n.ts';

const BUDGET_TESTS = 'src/**/*.budget.test.{ts,tsx}';

// FSD layers; the same list is in `paths` of both tsconfigs.
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

const APP_ENTRY = '/src/app/main.tsx';
const MOCK_ENTRY = '/mocks/enable.ts';
const WORKER_PATH = '/mockServiceWorker.js';

/**
 * Mocks of missing daemon endpoints. Enabled by `METABOX_MOCK=missing|all` and live
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
  const mode = process.env.METABOX_MOCK;

  if (mode !== 'missing' && mode !== 'all') {
    return false;
  }

  return {
    name: 'metabox-mocks',
    apply: 'serve',
    config: () => ({
      define: {
        __METABOX_MOCK__: JSON.stringify(mode),
        __METABOX_MOCK_CONNECTIONS__: JSON.stringify(Number(process.env.METABOX_MOCK_CONNECTIONS ?? 0)),
      },
    }),
    configureServer(server) {
      const require = createRequire(import.meta.url);
      const worker = path.join(path.dirname(require.resolve('msw/package.json')), 'lib/mockServiceWorker.js');

      server.middlewares.use(WORKER_PATH, (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript');
        response.setHeader('Service-Worker-Allowed', '/');
        response.end(readFileSync(worker, 'utf8'));
      });
    },
    transformIndexHtml: (html) => html.replace(APP_ENTRY, MOCK_ENTRY),
  };
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

const LOCALE_SEGMENT = 'i18n';
const LOCALE_GLOB = `src/**/${LOCALE_SEGMENT}/*.json`;

/** The URL map of dictionaries arrives in the bundle as a module: there is no extra request for it. */
const LOCALE_MODULE = 'virtual:metabox-locales';

/**
 * Locale tooling: the namespace map (artifact of `tools/i18n.ts`), cross-language
 * dictionary checking and serving of the dictionaries themselves.
 *
 * Dictionaries go to `dist/locales/<namespace>/<language>-<fingerprint>.json` as files,
 * not as chunks: the runtime fetches them with `fetch`, so the text does not end up in any
 * build module — neither as an import error nor as a lazy chunk. The fingerprint in the name is the same
 * as for other assets: the daemon serves such a file with an eternal cache, and a new
 * panel version arrives under a new address. The runtime cannot know the name
 * in advance, so the plugin prints the URL map.
 *
 * The map changes only when a locale appears or disappears — keys are taken from
 * the JSON itself. A text edit inside a file does not touch the map but reloads
 * the page: the loaded dictionary sits in i18next memory, and a hot update
 * of the module does not reach it.
 */
function metaboxI18n(): Plugin {
  const root = import.meta.dirname;
  let isBuild = false;
  const urls = new Map<string, string>();

  function report(problems: readonly string[]) {
    if (problems.length > 0) {
      console.warn(`[I18N] dictionaries diverged:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    }
  }

  return {
    name: 'metabox-i18n',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    resolveId(id) {
      return id === LOCALE_MODULE ? `\0${LOCALE_MODULE}` : undefined;
    },
    load(id) {
      if (id !== `\0${LOCALE_MODULE}`) {
        return undefined;
      }

      return `export const LOCALE_URLS = ${JSON.stringify(Object.fromEntries(urls))};`;
    },
    buildStart() {
      writeI18nTypes(root);

      const problems = checkLocales(root);

      report(problems);

      if (problems.length > 0) {
        this.error('[I18N] language dictionaries do not match by keys');
      }

      urls.clear();

      for (const locale of collectLocales(path.join(root, 'src'))) {
        const source = readFileSync(locale.file, 'utf8');
        // On the dev server the dictionary is read by the middleware below — there it is taken from
        // the source, and a fingerprint in the name would only get in the way of editing.
        const url = isBuild ? hashedLocaleUrl(locale, source) : locale.url;

        urls.set(localeKey(locale.language, locale.namespace), `/${url}`);

        if (isBuild) {
          this.emitFile({ type: 'asset', fileName: url, source });
        }
      }
    },
    configureServer(server) {
      server.watcher.add(path.join(root, LOCALE_GLOB));

      // The dev server serves dictionaries from the same addresses as the build: otherwise
      // the runtime would have to be taught two ways to look for them.
      server.middlewares.use(`/${LOCALE_ROOT}/`, (request, response, next) => {
        const locale = collectLocales(path.join(root, 'src')).find(
          (candidate) => `/${candidate.url}` === `/${LOCALE_ROOT}${request.url ?? ''}`
        );

        if (locale === undefined) {
          next();

          return;
        }

        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(readFileSync(locale.file, 'utf8'));
      });

      function onLocaleChange(file: string) {
        if (!file.endsWith('.json') || !file.includes(`${path.sep}${LOCALE_SEGMENT}${path.sep}`)) {
          return;
        }

        writeI18nTypes(root);
        report(checkLocales(root));
        server.ws.send({ type: 'full-reload' });
      }

      server.watcher.on('add', onLocaleChange).on('change', onLocaleChange).on('unlink', onLocaleChange);
    },
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
  plugins: [react(), tailwindcss(), metaboxI18n(), metaboxCompress(), metaboxMocks(), metaboxScan()],
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
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Budget measurements run as a separate group after the rest, one file at a time:
    // parallel neighbours take the CPU, and the measurement on a CI runner goes over the threshold.
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, BUDGET_TESTS],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'budget',
          include: [BUDGET_TESTS],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
