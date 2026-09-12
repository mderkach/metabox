/**
 * Тексты интерфейса. Отдельный словарь нужен потому, что тосты выводятся
 * централизованно по `meta` запроса, а `meta` несёт ключ, а не готовую строку
 * (Query.md).
 *
 * Библиотеки локализации нет намеренно: язык один, а плюрализация и
 * интерполяция пока не нужны. Появится второй язык — здесь встанет adapter.
 */
export const MESSAGES = {
  'apply.confirm.done': 'Связь подтверждена, конфиг оставлен',
  'apply.start.accepted': 'Конфиг принят, идёт применение',
  'config.draft.fetchFailed': 'Не удалось загрузить конфиг',
  'config.versions.fetchFailed': 'Не удалось получить историю версий',
  'connection.close.failed': 'Закрыть соединение не удалось',
  'error.unknown': 'Что-то пошло не так',
  'proxy.delay.failed': 'Проверить задержку не удалось',
  'proxy.list.fetchFailed': 'Не удалось получить список прокси',
  'proxy.providers.fetchFailed': 'Не удалось получить подписки',
  'proxy.select.failed': 'Переключить узел не удалось',
  'route.explain.failed': 'Не удалось объяснить маршрут',
  'service.action.failed': 'Команда сервису не прошла',
  'status.fetchFailed': 'Демон не отвечает',
} as const;

export type MessageKey = keyof typeof MESSAGES;
