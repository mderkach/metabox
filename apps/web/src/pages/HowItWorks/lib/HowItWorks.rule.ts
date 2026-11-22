import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getConfigOptions, readRuleNames, readRules, useConfigDirty } from '@entities/Config';
import { getAppliedRuleIndex, getRuleEditorSearch, type AppliedRuleReference } from '@entities/Route';
import { ruleSetReferencesOf, toRuleRowsFromNodes, useRuleTitle } from '@entities/Rule';

import type { VerifiedWalkRule } from '../model/HowItWorks.model';

export function useHowItWorksRule(appliedRule: AppliedRuleReference | null): VerifiedWalkRule | null {
  const config = useQuery({ ...getConfigOptions(), enabled: appliedRule !== null });
  const hasDraft = useConfigDirty();
  const { title } = useRuleTitle();
  const appliedEtag = config.data?.etag;
  const text = config.data?.text;
  const position = getAppliedRuleIndex(appliedRule, appliedEtag);
  const row = useMemo(() => {
    if (position === null || text === undefined) return undefined;

    return toRuleRowsFromNodes(readRules(text), readRuleNames(text)).find((rule) => rule.index === position + 1);
  }, [position, text]);

  return position === null || row === undefined
    ? null
    : {
        position,
        label: title(row),
        services: ruleSetReferencesOf(row),
        editorSearch: getRuleEditorSearch(appliedRule, { appliedEtag, hasDraft }),
      };
}
