import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, RULES_PATH } from '@entities/Config';
import { showQueryError } from '@shared/api';
import { Button } from '@shared/ui';

import { MOVE, type Move } from '../model/RuleReorder.constants';

/**
 * Moving a rule by one position: in sing-box rule order is the logic, so a move
 * is an edit, not a view. A move is one store operation (ADR-0004): the node is
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
  index,
  total,
  onMoved,
}: {
  /** Rule number, from one. */
  index: number;
  /** `route.rules` length, not the selected list's. */
  total: number;
  /** The number the rule moved to. */
  onMoved: (index: number) => void;
}) {
  const { t } = useTranslation('features/Rule/RuleReorder');
  const move = ConfigDocumentState.use.move();
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const focusAfterMove = useRef<Move | null>(null);

  useEffect(
    function keepFocusAfterMove() {
      const step = focusAfterMove.current;

      if (step === null) {
        return;
      }

      focusAfterMove.current = null;
      (step === MOVE.Up ? upRef : downRef).current?.focus();
    },
    [index]
  );

  function onMove(step: Move) {
    const target = index + step;
    const atEdge = target === 1 || target === total;

    if (!move(RULES_PATH, index - 1, target - 1)) {
      showQueryError({ showError: true, errorMessageKey: 'toast.rule.reorder.failed' }, null);

      return;
    }

    focusAfterMove.current = atEdge ? opposite(step) : step;
    onMoved(target);
  }

  return (
    <>
      <Button
        ref={upRef}
        variant='ghost'
        size='icon-sm'
        aria-label={t('up', { index })}
        disabled={index <= 1}
        onClick={() => {
          onMove(MOVE.Up);
        }}
      >
        <ChevronUp />
      </Button>
      <Button
        ref={downRef}
        variant='ghost'
        size='icon-sm'
        aria-label={t('down', { index })}
        disabled={index >= total}
        onClick={() => {
          onMove(MOVE.Down);
        }}
      >
        <ChevronDown />
      </Button>
    </>
  );
}

function opposite(step: Move): Move {
  return step === MOVE.Up ? MOVE.Down : MOVE.Up;
}
