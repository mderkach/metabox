import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, RULES_PATH } from '@entities/Config';
import { Button } from '@shared/ui';

import { MOVE, type Move } from '../model/RuleReorder.constants';

/**
 * Перестановка правила на одну позицию: в sing-box порядок правил и есть
 * логика, поэтому переезд — правка, а не вид. Перестановка одна операция стора
 * (ADR-0004): узел вынимается и вставляется одним шагом, и номера соседей под
 * вызывающим кодом не сдвигаются.
 *
 * Правило переставляется по всему `route.rules`, а не по отобранным строкам:
 * отбор показывает часть списка, а порядок у файла один.
 *
 * Фокус остаётся на нажатой кнопке. На краю списка она гаснет, и фокус уходит
 * на соседнюю — иначе он упал бы на `body` вместе с выключенной кнопкой.
 */
export function RuleReorderButtons({
  index,
  total,
  onMoved,
}: {
  /** Номер правила, с единицы. */
  index: number;
  /** Длина `route.rules`, а не отобранного списка. */
  total: number;
  /** Номер, на который правило переехало. */
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

    focusAfterMove.current = atEdge ? opposite(step) : step;
    move(RULES_PATH, index - 1, target - 1);
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
