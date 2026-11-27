import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from './Button';

export function ReorderButtons({
  index,
  first,
  last,
  upLabel,
  downLabel,
  onMove,
}: {
  index: number;
  first: number;
  last: number;
  upLabel: string;
  downLabel: string;
  onMove: (target: number) => boolean;
}) {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const focus = useRef<'up' | 'down' | null>(null);
  useEffect(
    function keepFocusAfterMove() {
      if (focus.current === null) return;
      (focus.current === 'up' ? up : down).current?.focus();
      focus.current = null;
    },
    [index]
  );

  function move(step: -1 | 1) {
    const target = index + step;
    if (onMove(target)) focus.current = target === first || (step > 0 && target < last) ? 'down' : 'up';
  }

  return (
    <>
      <Button
        type='button'
        ref={up}
        variant='ghost'
        size='icon-sm'
        aria-label={upLabel}
        disabled={index <= first}
        onClick={() => {
          move(-1);
        }}
      >
        <ChevronUp />
      </Button>
      <Button
        type='button'
        ref={down}
        variant='ghost'
        size='icon-sm'
        aria-label={downLabel}
        disabled={index >= last}
        onClick={() => {
          move(1);
        }}
      >
        <ChevronDown />
      </Button>
    </>
  );
}
