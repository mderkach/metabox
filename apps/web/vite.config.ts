import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';

import { LOCALE_ROOT, checkLocales, collectLocales, hashedLocaleUrl, localeKey, writeI18nTypes } from './tools/i18n.ts';

// Слои FSD; тот же список — в `paths` обоих tsconfig.
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

const APP_ENTRY = '/src/app/main.tsx';
const MOCK_ENTRY = '/mocks/enable.ts';
const WORKER_PATH = '/mockServiceWorker.js';

/**
 * Моки недостающих ручек демона. Включаются `METABOX_MOCK=missing|all` и живут
 * только на дев-сервере: `apply: 'serve'` не даёт плагину участвовать в сборке,
 * поэтому подменённого входа в `dist` не бывает.
 *
 * `METABOX_MOCK_CONNECTIONS=<число>` раздувает снапшот соединений до указанного
 * размера: панель обязана держать пять тысяч живых соединений (NFR-2), и
 * проверить это руками больше нечем — на стенде столько трафика не бывает.
 *
 * Скрипт воркера отдаётся из `node_modules`, а не кладётся в `public/`: файл в
 * `public/` уехал бы в `dist`, а оттуда через `go:embed` — в бинарь демона.
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
 * Съём ререндеров react-scan. Включается `METABOX_SCAN=1` и живёт только на
 * дев-сервере: `apply: 'serve'` не даёт плагину участвовать в сборке, а
 * инструментирование рендеров стоит времени и в замер NFR-2 попадать не должно.
 *
 * Скрипт идёт в `head` — раньше входа приложения: bippy подменяет хук
 * девтулзов, и до первого рендера React это сделать уже нельзя.
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

/** Карта адресов словарей приезжает в бандл модулем: лишнего запроса за ней нет. */
const LOCALE_MODULE = 'virtual:metabox-locales';

/**
 * Оснастка локалей: карта неймспейсов (артефакт `tools/i18n.ts`), сверка
 * словарей между языками и раздача самих словарей.
 *
 * Словари уезжают в `dist/locales/<неймспейс>/<язык>-<отпечаток>.json` файлами,
 * а не чанками: рантайм берёт их `fetch`, поэтому текст не попадает ни в один
 * модуль сборки — ни ошибкой импорта, ни ленивым чанком. Отпечаток в имени тот
 * же, что у остальных ассетов: демон отдаёт такой файл вечным кэшем, а новая
 * версия панели приходит под новым адресом (ADR-0019, ADR-0020). Знать имя
 * наперёд рантайм не может, поэтому карту адресов печатает плагин.
 *
 * Карту меняет только появление и исчезновение локали — ключи берутся из
 * самого JSON. Правка текста внутри файла карту не трогает, но перезагружает
 * страницу: загруженный словарь лежит в памяти i18next, и горячее обновление
 * модуля до него не доходит.
 */
function metaboxI18n(): Plugin {
  const root = import.meta.dirname;
  let isBuild = false;
  const urls = new Map<string, string>();

  function report(problems: readonly string[]) {
    if (problems.length > 0) {
      console.warn(`[I18N] словари разошлись:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
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
        this.error('[I18N] словари языков не сошлись по ключам');
      }

      urls.clear();

      for (const locale of collectLocales(path.join(root, 'src'))) {
        const source = readFileSync(locale.file, 'utf8');
        // На дев-сервере словарь читает middleware ниже — там он берётся из
        // исходника, и отпечаток в имени только мешал бы правке.
        const url = isBuild ? hashedLocaleUrl(locale, source) : locale.url;

        urls.set(localeKey(locale.language, locale.namespace), `/${url}`);

        if (isBuild) {
          this.emitFile({ type: 'asset', fileName: url, source });
        }
      }
    },
    configureServer(server) {
      server.watcher.add(path.join(root, LOCALE_GLOB));

      // Дев-сервер отдаёт словари с тех же адресов, что и сборка: иначе
      // рантайм пришлось бы учить двум способам их искать.
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

/** Что сжимать: остальное либо уже сжато (woff2), либо мельче заголовка ответа. */
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg']);
const MIN_COMPRESS_BYTES = 256;
/** Ниже этого выигрыша второй файл в бинаре не окупается. */
const MIN_COMPRESS_RATIO = 0.9;

/**
 * Предсжатие статики. Демон компрессора не имеет и не должен: сжимать один и
 * тот же файл на каждый запрос — это процессорное время роутера на ровном
 * месте. Сборка кладёт рядом `.br` и `.gz`, демон выбирает по `Accept-Encoding`.
 *
 * Оба формата, а не только brotli: браузеры объявляют `br` не на всяком
 * соединении, а панель живёт по обычному http в локальной сети.
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

// changeOrigin подменяет только Host, а демон сверяет Origin с адресом панели и
// без совпадения отбивает любой мутирующий запрос. Дев-сервер представляется
// самим демоном — иначе демону пришлось бы открывать чужой источник.
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
      // Оснастка тестов: не слой, но тесты внутри слоёв ходят к ней по алиасу.
      '@test': path.resolve(import.meta.dirname, './src/test'),
    },
  },
  server: {
    // В контейнере слушать loopback бесполезно — снаружи порт не виден.
    host: true,
    // Полезная нагрузка HMR ходит по тому же порту, что и страница;
    // без явного указания клиент в браузере пытается стучаться в контейнерный хост.
    watch: { usePolling: false },
    proxy: {
      // Демон живёт в целевом окружении (контейнер target), а не рядом с dev-сервером.
      '/api': {
        target: daemonTarget,
        changeOrigin: true,
        configure: sendDaemonOrigin,
        // Поток соединений и трафика ходит под тем же префиксом: без этого
        // апгрейд до WebSocket упирается в дев-сервер, а не в демона.
        ws: true,
      },
      '/healthz': {
        target: daemonTarget,
        changeOrigin: true,
        configure: sendDaemonOrigin,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
