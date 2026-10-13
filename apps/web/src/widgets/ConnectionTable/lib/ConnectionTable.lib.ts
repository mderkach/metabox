import { useEffect, useState } from 'react';

import { MS_IN_SECOND } from '@shared/lib/time';

/**
 * Clock for the time column. A separate tick, not `Date.now()` in the row body:
 * the row is memoized and with unchanged bytes would not rerender, that
 * is, it would show the time as of the last counter change.
 *
 * The price is a render of visible rows once a second: `memo` on them saves a subtree
 * comparison, but not the call itself. The list is virtualized, so this is tens of
 * rows, not all five thousand.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(function startClock() {
    const timer = setInterval(function tick() {
      setNow(Date.now());
    }, MS_IN_SECOND);

    return function stopClock() {
      clearInterval(timer);
    };
  }, []);

  return now;
}
