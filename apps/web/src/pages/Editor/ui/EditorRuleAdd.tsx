import { useMemo } from 'react';

import { newRulePlace, type RuleRow } from '@entities/Rule';
import { RuleAddButton } from '@features/Rule/RuleAdd';

/** The add button with the position and outbound chosen for the new rule by the rule list. */
export function EditorRuleAdd({
  rules,
  total,
  finalOutbound,
  onAdded,
}: {
  rules: readonly RuleRow[];
  /** Nodes in `route.rules`, not rows: a non-object node gets no row but takes a position. */
  total: number;
  finalOutbound: string | null;
  onAdded: (index: number) => void;
}) {
  const place = useMemo(() => newRulePlace(rules, total, finalOutbound), [rules, total, finalOutbound]);

  return <RuleAddButton index={place?.index ?? total + 1} outbound={place?.outbound ?? null} onAdded={onAdded} />;
}
