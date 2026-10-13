import { useEffect, useState } from 'react';

import { MS_IN_MINUTE } from '@shared/lib/time';

/**
 * Current time in one-minute steps: the "updated N ago" label does not show
 * seconds, so there is no reason to redraw the subscription list more often.
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(function startClock() {
    const timer = setInterval(function tick() {
      setNow(Date.now());
    }, MS_IN_MINUTE);

    return function stopClock() {
      clearInterval(timer);
    };
  }, []);

  return now;
}
