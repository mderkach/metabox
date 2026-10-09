/** Адрес диагностики обвязки. Пустой узел демон не проверяет: строка `proxy` приходит пропуском. */
export const DIAG_ENDPOINT = {
  report: () => '/api/diag',
} as const;
