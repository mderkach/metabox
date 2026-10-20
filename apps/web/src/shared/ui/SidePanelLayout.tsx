import { createContext, use, useEffect, useMemo, useState, type ReactNode, type TransitionEvent } from 'react';

import { useReducedMotion } from '../lib/media';
import { MS_IN_SECOND } from '../lib/time';
import { cn } from '../lib/utils';

/** End of the panel slide-out: the departing content is dropped by it. */
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
  /** The panel has slid away, and there is no reason to keep its content anymore. */
  settled: boolean;
}

const SidePanelContext = createContext<SidePanelState>({ open: false, settled: true });

/**
 * The list and the panel over its right edge. The list keeps its width when
 * the panel opens and closes: a column that appeared or collapsed would
 * reflow the table and rewrap its rows. Without animation
 * (`prefers-reduced-motion`) `transitionend` does not arrive, and the
 * departing content goes in the same render.
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
        className={cn('relative grid grid-cols-1 grid-rows-[minmax(0,1fr)]', className)}
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
 * The panel slides in from the right over the list. A closed panel, while
 * sliding away, shows what it was closed with, not emptiness. A panel taller
 * than the list goes on below it.
 *
 * `className` goes to the panel wrapper, for example `items-start` for a panel
 * shorter than the list.
 */
function SidePanelLayoutPanel({ className, children }: { className?: string; children: ReactNode }) {
  const { open, settled } = use(SidePanelContext);
  const [held, setHeld] = useState<ReactNode>(open ? children : null);

  if (open && held !== children) {
    setHeld(children);
  }

  const shown = open ? children : !settled && held;

  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 z-10 flex max-w-full justify-end overflow-x-clip pl-6 *:*:shadow-xl',
        settled && 'invisible'
      )}
    >
      <div
        data-slot='side-panel'
        className={cn(
          'pointer-events-auto grid w-md max-w-full shrink-0 grid-rows-[minmax(0,1fr)] transition-[opacity,translate] ease-(--motion-ease-out) motion-reduce:transition-none',
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
