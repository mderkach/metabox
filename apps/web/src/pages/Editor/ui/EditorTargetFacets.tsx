import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isNamedRuleAction, RULE_TARGET } from '@entities/Rule';
import { SHARED_NS } from '@shared/i18n';
import { FacetFilter, type FacetText, type FacetValue } from '@shared/ui';

import { EDITOR_NS } from '../i18n/Editor.namespace.generated';
import type { RuleFilterState } from '../lib/Editor.filter';

/** Outbound facet: an action is named in words, an outbound by its tag. */
export function EditorTargetFacets({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation(EDITOR_NS);
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
      label: actions.has(value) && isNamedRuleAction(value) ? t(`ruleAction.${value}`, { ns: SHARED_NS }) : value,
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
