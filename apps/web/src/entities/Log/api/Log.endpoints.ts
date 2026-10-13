/** sing-box log addresses. The level in the `level` parameter is the minimum: the daemon serves it and everything above. */
export const LOG_ENDPOINT = {
  logs: () => '/api/logs',
  stream: () => '/api/logs/stream',
  clear: () => '/api/logs/clear',
} as const;
