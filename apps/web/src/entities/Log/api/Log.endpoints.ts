/** Адреса лога sing-box. Уровень в параметре `level` — минимальный: демон отдаёт его и всё, что выше. */
export const LOG_ENDPOINT = {
  logs: () => '/api/logs',
  stream: () => '/api/logs/stream',
  clear: () => '/api/logs/clear',
} as const;
