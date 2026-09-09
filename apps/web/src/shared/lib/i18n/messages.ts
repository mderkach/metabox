/**
 * Тексты интерфейса. Отдельный словарь нужен потому, что тосты выводятся
 * централизованно по `meta` запроса, а `meta` несёт ключ, а не готовую строку
 * (Query.md).
 *
 * Библиотеки локализации нет намеренно: язык один, а плюрализация и
 * интерполяция пока не нужны. Появится второй язык — здесь встанет adapter.
 */
export const MESSAGES = {
  "apply.confirm.failed": "Подтвердить не удалось",
  "apply.confirm.done": "Связь подтверждена, конфиг оставлен",
  "apply.start.failed": "Применить не удалось",
  "apply.start.accepted": "Конфиг принят, идёт применение",
  "apply.state.failed": "Не удалось узнать ход применения",
  "config.draft.fetchFailed": "Не удалось загрузить конфиг",
  "error.unknown": "Что-то пошло не так",
  "status.fetchFailed": "Демон не отвечает",
} as const

export type MessageKey = keyof typeof MESSAGES
