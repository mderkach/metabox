export const RULE_HITS_STATE = {
  Pending: 'pending',
  Counted: 'counted',
  /** Демон счёт не отдал: sing-box лежит или ручки нет. */
  Failed: 'failed',
  /** Процесс работает не на применённом конфиге: номера его правил — чужие. */
  Mismatch: 'mismatch',
} as const;

/**
 * Колонка срабатываний. Счёт привязан к строке, а не к номеру: правило,
 * изменённое в черновике, счёта не получает, а переставленное несёт свой.
 */
export type RuleHitsColumn =
  | { state: typeof RULE_HITS_STATE.Pending | typeof RULE_HITS_STATE.Failed | typeof RULE_HITS_STATE.Mismatch }
  | {
      state: typeof RULE_HITS_STATE.Counted;
      /** Сколько идёт счёт: с запуска демона. */
      seconds: number;
      /** Срабатывания по идентификатору строки; строки без записи счёта не имеют. */
      counts: ReadonlyMap<string, number>;
    };
