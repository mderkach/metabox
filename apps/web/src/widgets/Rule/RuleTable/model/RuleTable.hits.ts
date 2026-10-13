export const RULE_HITS_STATE = {
  Pending: 'pending',
  Counted: 'counted',
  /** The daemon did not return the count: sing-box is down or the endpoint is missing. */
  Failed: 'failed',
  /** The process does not run on the applied config: its rule numbers are foreign. */
  Mismatch: 'mismatch',
} as const;

/**
 * Hits column. The count is bound to the row, not to the number: a rule
 * changed in the draft gets no count, and a reordered one carries its own.
 */
export type RuleHitsColumn =
  | { state: typeof RULE_HITS_STATE.Pending | typeof RULE_HITS_STATE.Failed | typeof RULE_HITS_STATE.Mismatch }
  | {
      state: typeof RULE_HITS_STATE.Counted;
      /** How long the count runs: since the daemon started. */
      seconds: number;
      /**
       * Hits by row identifier. Rows have no count entry
       * when the rule is changed in the draft; `null` means the rule is not visible in the core
       * connection list, and a zero for it would be untrue.
       */
      counts: ReadonlyMap<string, number | null>;
    };

/** What stands in the hits cell besides the number. */
export const RULE_HIT = {
  /** The rule is changed in the draft: only the applied one has a count. */
  Edited: 'edited',
  /** The rule is not visible in the core connection list. */
  Unobserved: 'unobserved',
} as const;

export type RuleHitCell = number | (typeof RULE_HIT)[keyof typeof RULE_HIT];
