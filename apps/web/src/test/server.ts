import { setupServer } from 'msw/node';

/**
 * Стартует пустым: хендлеры подключает сам тест через `server.use(...)`.
 * `onUnhandledRequest: 'error'` в `setup.ts` превращает забытый мок в падение,
 * а не в молчаливый запрос в сеть.
 */
export const server = setupServer();
