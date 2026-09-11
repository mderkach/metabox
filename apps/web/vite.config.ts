import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

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
    config: () => ({ define: { __METABOX_MOCK__: JSON.stringify(mode) } }),
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), metaboxMocks()],
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
        target: process.env.METABOX_API_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
        // Поток соединений и трафика ходит под тем же префиксом: без этого
        // апгрейд до WebSocket упирается в дев-сервер, а не в демона.
        ws: true,
      },
      '/healthz': {
        target: process.env.METABOX_API_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
