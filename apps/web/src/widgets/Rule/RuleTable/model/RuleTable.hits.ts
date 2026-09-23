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
      /**
       * Срабатывания по идентификатору строки. Строки без записи счёта не
       * имеют — правило изменено в черновике; `null` — правило в списке
       * соединений core не видно, и ноль про него был бы неправдой.
       */
      counts: ReadonlyMap<string, number | null>;
    };

/** Что стоит в ячейке срабатываний, кроме числа. */
export const RULE_HIT = {
  /** Правило изменено в черновике: счёт есть только у применённого. */
  Edited: 'edited',
  /** Правило в списке соединений core не видно. */
  Unobserved: 'unobserved',
} as const;

export type RuleHitCell = number | (typeof RULE_HIT)[keyof typeof RULE_HIT];
