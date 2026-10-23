import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isNamedRuleAction, RULE_TARGET } from '@entities/Rule';
import { FacetFilter, type FacetText, type FacetValue } from '@shared/ui';

import type { RuleFilterState } from '../lib/Editor.lib';

/** Outbound facet: an action is named in words, an outbound by its tag. */
export function EditorTargetFacets({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');
  const { targets, target, setTarget } = filter;

  const values = useMemo<FacetValue[]>(
    () => targets.map((group) => ({ value: group.target, count: group.count })),
    [targets]
  );
  const actions = useMemo(
    () => new Set(targets.filter((group) => group.kind === RULE_TARGET.Action).map((group) => group.target)),
    [targets]
  );

  const describe = useCallback(
    (value: string): FacetText => ({
      label: actions.has(value) && isNamedRuleAction(value) ? t(`ruleAction.${value}`, { ns: 'shared' }) : value,
      detail: null,
    }),
    [actions, t]
  );

  return (
    <FacetFilter
      label={t('targets.label')}
      values={values}
      selected={target}
      describe={describe}
      onSelectedChange={setTarget}
    />
  );
}
