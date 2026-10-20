import { useMemo } from 'react';

import { newRulePlace, type NewRulePlace, type RuleRow } from '@entities/Rule';
import { RuleAddButton } from '@features/Rule/RuleAdd';

/** The add button with the position and outbound the rule list gives the new rule. */
export function EditorRuleAdd({
  rules,
  total,
  finalOutbound,
  onAdd,
}: {
  rules: readonly RuleRow[];
  /** Nodes in `route.rules`, not rows: a non-object node gets no row but takes a position. */
  total: number;
  finalOutbound: string | null;
  onAdd: (place: NewRulePlace) => void;
}) {
  const place = useMemo(() => newRulePlace(rules, total, finalOutbound), [rules, total, finalOutbound]);

  return (
    <RuleAddButton
      disabled={place === null}
      onAdd={() => {
        if (place !== null) {
          onAdd(place);
        }
      }}
    />
  );
}
