import { useEffect, useRef, useState } from 'react';

import type { ConnectionRow } from '@entities/Connection';
import { REFRESH_INTERVAL } from '@widgets/ConnectionTable';

/**
 * Shown row set, updated no more often than the given interval.
 *
 * Throttling lives on the screen, not in the store: the history ring there is
 * labeled "per minute" at a one-second snapshot step, and a stretched step
 * would turn a minute into a quarter of an hour. The overview summary is
 * computed there and for the same reason stays live.
 *
 * With `Live` the set is served without delay: an extra state frame every
 * second would cost more than the delay itself.
 */
export function useThrottledRows(rows: ConnectionRow[], interval: number): ConnectionRow[] {
  const latest = useRef(rows);
  const [shown, setShown] = useState(rows);

  useEffect(function keepLatestRows() {
    latest.current = rows;
  });

  useEffect(
    function startRefresh() {
      // The first set is shown at once: otherwise an interval change would
      // blank the list until the end of the first period.
      setShown(latest.current);

      if (interval === REFRESH_INTERVAL.Live) {
        return;
      }

      const timer = setInterval(function refreshRows() {
        setShown(latest.current);
      }, interval);

      return function stopRefresh() {
        clearInterval(timer);
      };
    },
    [interval]
  );

  return interval === REFRESH_INTERVAL.Live ? rows : shown;
}
