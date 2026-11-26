import { useMemo } from 'react';

import { readRuleNames, useConfig, useConfigDirty } from '@entities/Config';
import {
  getAppliedRuleIndex,
  getRuleEditorSearch,
  ROUTE_MATCH,
  useRouteExplanation,
  type RouteExplanation,
  type RuleEditorSearch,
} from '@entities/Route';

const VISIBLE_BEFORE = 5;

export interface RouteExplanationState {
  isPending: boolean;
  /** Explanation request: a failure is a panel state of its own, not blank space under the title. */
  query: ReturnType<typeof useRouteExplanation>;
  explanation: RouteExplanation | null;
  appliedIndex: number | null;
  ruleName: string | null;
  editorSearch: RuleEditorSearch;
  /** Rules before the one that hit: they were checked and did not match. */
  before: RouteExplanation['rules'];
}

export function useRouteExplanationState(connectionId: string | null): RouteExplanationState {
  const query = useRouteExplanation(connectionId);
  const config = useConfig();
  const hasDraft = useConfigDirty();
  const explanation = query.data ?? null;
  const reference = explanation?.match.appliedRule;
  const appliedEtag = config.data?.etag;
  const appliedIndex = getAppliedRuleIndex(reference, appliedEtag);
  const text = config.data?.text;

  const ruleName = useMemo(
    () => (text === undefined || appliedIndex === null ? null : (readRuleNames(text)[appliedIndex] ?? null)),
    [text, appliedIndex]
  );

  const before = useMemo(() => {
    if (explanation === null || explanation.match.kind !== ROUTE_MATCH.Rule || explanation.match.index === null) {
      return [];
    }

    return explanation.rules.slice(Math.max(0, explanation.match.index - VISIBLE_BEFORE), explanation.match.index);
  }, [explanation]);

  return {
    isPending: query.isPending && connectionId !== null,
    query,
    explanation,
    appliedIndex,
    ruleName,
    editorSearch: getRuleEditorSearch(reference, { appliedEtag, hasDraft }),
    before,
  };
}
