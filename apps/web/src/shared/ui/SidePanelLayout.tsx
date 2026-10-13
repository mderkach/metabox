import { createContext, use, useEffect, useMemo, useState, type ReactNode, type TransitionEvent } from 'react';

import { useReducedMotion } from '../lib/media';
import { MS_IN_SECOND } from '../lib/time';
import { cn } from '../lib/utils';

/**
 * The panel column is its width plus the gap to the list. The gap lives in the column, not
 * in the grid `gap`: for a closed panel it would remain a strip to the right of the list.
 */
const COLUMNS_OPEN = 'grid-cols-[minmax(0,1fr)_calc(var(--container-md)+--spacing(4))]';
const COLUMNS_CLOSED = 'grid-cols-[minmax(0,1fr)_0rem]';

/** End of the panel slide-out: the column collapses by it. */
const PANEL_PROPERTY = 'translate';

/**
 * A fallback for when `transitionend` does not arrive: the transition was interrupted or did not
 * start because the panel was opened and closed in one frame. Longer than the slide-out
 * itself, so as not to cut it off.
 */
const SETTLE_FALLBACK_SECONDS = 0.5;
const SETTLE_FALLBACK = SETTLE_FALLBACK_SECONDS * MS_IN_SECOND;

interface SidePanelState {
  open: boolean;
  /** The panel has slid away, and there is no reason to keep its column and content anymore. */
  settled: boolean;
}

const SidePanelContext = createContext<SidePanelState>({ open: false, settled: true });

/**
 * The list and the panel beside it.
 *
 * The list width changes once, and only the panel moves: on opening
 * the column sets at once and the panel slides into it, on closing the panel slides away and
 * the column collapses after. A grid width transition would relayout the table on
 * every frame, and rows that became cramped would wrap onto a second line
 * mid-motion.
 *
 * Without animation (`prefers-reduced-motion`) `transitionend` does not arrive —
 * the column and the departing content are removed in the same render.
 */
function SidePanelLayoutRoot({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [settled, setSettled] = useState(!open);

  if (open && settled) {
    setSettled(false);
  }

  if (!open && !settled && reducedMotion) {
    setSettled(true);
  }

  const state = useMemo(() => ({ open, settled }), [open, settled]);

  useEffect(
    function settleWithoutTransition() {
      if (open || settled) {
        return;
      }

      const timer = setTimeout(function settleLate() {
        setSettled(true);
      }, SETTLE_FALLBACK);

      return function cancelSettleTimer() {
        clearTimeout(timer);
      };
    },
    [open, settled]
  );

  function settle(event: TransitionEvent<HTMLDivElement>) {
    if (
      !open &&
      event.propertyName === PANEL_PROPERTY &&
      event.target instanceof HTMLElement &&
      event.target.dataset.slot === 'side-panel'
    ) {
      setSettled(true);
    }
  }

  return (
    <SidePanelContext value={state}>
      <div
        data-slot='side-panel-layout'
        onTransitionEnd={settle}
        onTransitionCancel={settle}
        className={cn('grid grid-rows-[minmax(0,1fr)]', settled ? COLUMNS_CLOSED : COLUMNS_OPEN, className)}
      >
        {children}
      </div>
    </SidePanelContext>
  );
}

function SidePanelLayoutMain({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>{children}</div>;
}

/**
 * The panel slides in from the right into an already set column; the column clips it. A closed
 * panel, while sliding away, shows what it was closed with, not emptiness.
 *
 * `className` goes to the panel wrapper, for example `items-start` for a panel shorter
 * than the list or a sticky panel.
 */
function SidePanelLayoutPanel({ className, children }: { className?: string; children: ReactNode }) {
  const { open, settled } = use(SidePanelContext);
  const [held, setHeld] = useState<ReactNode>(open ? children : null);

  if (open && held !== children) {
    setHeld(children);
  }

  const shown = open ? children : !settled && held;

  return (
    <div inert={!open} aria-hidden={!open} className='flex min-w-0 justify-end overflow-clip'>
      <div
        data-slot='side-panel'
        className={cn(
          'grid w-md shrink-0 grid-rows-[minmax(0,1fr)] transition-[opacity,translate] ease-(--motion-ease-out) motion-reduce:transition-none',
          open
            ? 'translate-x-0 opacity-100 duration-(--motion-enter)'
            : 'translate-x-full opacity-0 duration-(--motion-exit)',
          className
        )}
      >
        {shown}
      </div>
    </div>
  );
}

export { SidePanelLayoutMain as Main, SidePanelLayoutPanel as Panel, SidePanelLayoutRoot as Root };
