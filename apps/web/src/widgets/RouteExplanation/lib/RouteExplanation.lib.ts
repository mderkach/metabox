import { useMemo } from 'react';

import { readRules, useConfig } from '@entities/Config';
import { ROUTE_MATCH, useRouteExplanation, type RouteExplanation } from '@entities/Route';

/** How many rules to show before the one that hit. */
const VISIBLE_BEFORE = 5;

export interface RouteExplanationState {
  isPending: boolean;
  /** Explanation request: a failure is a panel state of its own, not blank space under the title. */
  query: ReturnType<typeof useRouteExplanation>;
  explanation: RouteExplanation | null;
  /**
   * The process rule list matches the applied document in length.
   * `false` means the user cannot be led to the node: the core runs a different config,
   * and the index would point into a foreign document.
   */
  trusted: boolean;
  /** Rules in `route.rules` of the applied document; `null` means the document is not parsed. */
  inDocument: number | null;
  /** The lists could be reconciled: the config is read and parsed. */
  compared: boolean;
  /** Rules before the one that hit: they were checked and did not match. */
  before: RouteExplanation['rules'];
}

/**
 * Reconciliation of the rule list lives in the frontend, not in the daemon: the daemon is forbidden to
 * parse the config, and the document model belongs to the panel. Lengths are
 * compared — an element-wise comparison of conditions would require reproducing the fork's
 * rule rendering, which is exactly the drift that route explanation
 * is meant to avoid.
 */
export function useRouteExplanationState(connectionId: string | null): RouteExplanationState {
  const query = useRouteExplanation(connectionId);
  const config = useConfig();
  const explanation = query.data ?? null;
  // `null` means the config is not read yet: this is not the same as "no rules".
  const text = config.data?.text;
  const inDocument = useMemo(() => (text === undefined ? null : readRules(text).length), [text]);

  const before = useMemo(() => {
    if (explanation === null || explanation.match.kind !== ROUTE_MATCH.Rule || explanation.match.index === null) {
      return [];
    }

    return explanation.rules.slice(Math.max(0, explanation.match.index - VISIBLE_BEFORE), explanation.match.index);
  }, [explanation]);

  const compared = explanation !== null && inDocument !== null;

  return {
    isPending: query.isPending && connectionId !== null,
    query,
    explanation,
    trusted: compared && inDocument === explanation.rules.length,
    inDocument,
    compared,
    before,
  };
}
