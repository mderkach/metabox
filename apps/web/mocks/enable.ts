import { worker } from './browser';

/**
 * Вход дев-режима с моками. Приложение сюда не импортируется статически, и в
 * `src` про этот каталог нет ни одной ссылки: плагин `metabox-mocks` подменяет
 * вход в `index.html` только на дев-сервере, поэтому в сборку ничего из моков
 * попасть не может по построению.
 *
 * Режим `missing` пропускает существующие ручки демона на него самого, `all`
 * отвечает на всё сам — иначе панель без демона показывала бы баннер отказа
 * поверх мока.
 */
const MOCK_MODE = __METABOX_MOCK__;
const APP_ENTRY = '/src/app/main.tsx';

await worker.start({
  onUnhandledRequest: MOCK_MODE === 'all' ? 'warn' : 'bypass',
  serviceWorker: { url: '/mockServiceWorker.js' },
  quiet: true,
});

// Путь строкой: статический импорт втянул бы приложение в проект моков, а с ним
// и типы Node — ровно та связь, которой этот файл и существует, чтобы не было.
await import(/* @vite-ignore */ APP_ENTRY);
