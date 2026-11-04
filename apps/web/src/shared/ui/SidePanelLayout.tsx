import { useEffect, useMemo, useState, type ReactNode, type TransitionEvent } from 'react';

import { useReducedMotion } from '../lib/media';
import { MS_IN_SECOND } from '../lib/time';
import { cn } from '../lib/utils';
import { SidePanelContext } from './SidePanelLayout.context';

/** End of the panel slide-out: the departing content is dropped by it. */
const PANEL_PROPERTY = 'translate';

/**
 * A fallback for when `transitionend` does not arrive: the transition was interrupted or did not
 * start because the panel was opened and closed in one frame. Longer than the slide-out
 * itself, so as not to cut it off.
 */
const SETTLE_FALLBACK_SECONDS = 0.5;
const SETTLE_FALLBACK = SETTLE_FALLBACK_SECONDS * MS_IN_SECOND;

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

export { SidePanelLayoutRoot as Root };
export { SidePanelLayoutMain as Main } from './SidePanelLayoutMain';
export { SidePanelLayoutPanel as Panel } from './SidePanelLayoutPanel';
