import { useTranslation } from 'react-i18next';

import { showQueryError } from '@shared/api';
import { ReorderButtons } from '@shared/ui';

import { RULE_REORDER_NS } from '../i18n/RuleReorder.namespace.generated';
import { moveRouteRule, type RuleMovePolicy } from '../model/RuleReorder.move';

/**
 * Moving a rule by one position: in sing-box rule order is the logic, so a move
 * is an edit, not a view. A move is one store operation: the node is
 * taken out and inserted in one step, and neighbor numbers do not shift under
 * the calling code.
 *
 * A rule is moved across the whole `route.rules`, not across the selected rows:
 * a filter shows part of the list, while the file has one order.
 *
 * Focus stays on the pressed button. At the list edge it goes dim and focus
 * moves to the neighbor, otherwise it would fall to `body` together with the
 * disabled button.
 */
export function RuleReorderButtons({
  text,
  index,
  total,
  onMoved,
  allowMove,
}: {
  text: string | null;
  /** Rule number, from one. */
  index: number;
  /** `route.rules` length, not the selected list's. */
  total: number;
  /** The number the rule moved to. */
  onMoved?: (index: number) => void;
  /** A restricted view may refuse crossing an imported or overlapping rule. */
  allowMove?: RuleMovePolicy;
}) {
  const { t } = useTranslation(RULE_REORDER_NS);
  function move(target: number) {
    const result = moveRouteRule(text, index, target, allowMove);
    if (result === 'failed') showQueryError({ showError: true, errorMessageKey: 'toast.rule.reorder.failed' }, null);
    if (result !== 'moved') return false;
    onMoved?.(target);
    return true;
  }

  return (
    <ReorderButtons
      index={index}
      first={1}
      last={total}
      upLabel={t('up', { index })}
      downLabel={t('down', { index })}
      onMove={move}
    />
  );
}
