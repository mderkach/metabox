import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

import {
  filterRules,
  toTargetFilter,
  toTargetGroups,
  toTargetParam,
  type RuleRow,
  type RuleSearch,
  type RuleSetFilter,
  type RuleTargetFilter,
  type RuleTargetGroup,
} from '@entities/Rule';

export interface RuleFilterState {
  query: string;
  setQuery: (query: string) => void;
  /** Selected outbounds and actions, from the address. */
  target: RuleTargetFilter;
  setTarget: (target: RuleTargetFilter) => void;
  /** Rule set from the address: arrives with a visit from the rule set catalog. */
  ruleSet: RuleSetFilter;
  setRuleSet: (ruleSet: RuleSetFilter) => void;
  /** Clear the search and both filters: show the whole list. */
  reset: () => void;
  /** Outbounds of the whole list, counted with the search and the rule set but without their own selection. */
  targets: RuleTargetGroup[];
  rules: RuleRow[];
}

/**
 * Search and filtering by outbound and rule set. Filtering is client-side: the whole config is already in
 * the panel, and up to 500 rules are filtered in fractions of a millisecond.
 *
 * Outbounds and the rule set live in the address — a link to a filtered list can be shared, and the rule set
 * catalog leads to its rules — while the search remains screen state.
 */
export function useRuleFilter(rules: RuleRow[]): RuleFilterState {
  const [query, setQuery] = useState('');
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const ruleSet = search.rule_set ?? null;
  // The address serves values with structural sharing: the reference stands while the selection does not
  // change, and the filter is not recomputed on every render.
  const targetParam = search.target;
  const target = useMemo(() => toTargetFilter(targetParam), [targetParam]);

  // A changed filter replaces the address instead of adding a history entry: "back"
  // would bring back the filter the user just cleared.
  const patchSearch = useCallback(
    (patch: Pick<RuleSearch, 'rule_set' | 'target'>) => {
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );

  const setRuleSet = useCallback(
    (next: RuleSetFilter) => {
      patchSearch({ rule_set: next ?? undefined });
    },
    [patchSearch]
  );

  const setTarget = useCallback(
    (next: RuleTargetFilter) => {
      patchSearch({ target: toTargetParam(next) });
    },
    [patchSearch]
  );

  const reset = useCallback(() => {
    setQuery('');

    if (ruleSet !== null || target.length > 0) {
      patchSearch({ rule_set: undefined, target: undefined });
    }
  }, [patchSearch, ruleSet, target]);

  const unselected = useMemo(() => filterRules(rules, query, [], ruleSet), [rules, query, ruleSet]);
  const targets = useMemo(() => toTargetGroups(rules, unselected), [rules, unselected]);
  const shown = useMemo(() => filterRules(unselected, '', target), [unselected, target]);

  return {
    query,
    setQuery,
    target,
    setTarget,
    ruleSet,
    setRuleSet,
    reset,
    targets,
    rules: shown,
  };
}
