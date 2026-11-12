import { useEffect, useState } from 'react';

import { MS_IN_SECOND } from '@shared/lib/time';

/** Snapshots come once a second; the margin covers a late frame, as on the overview. */
const STALE_SECONDS = 8;
const STALE_AFTER = STALE_SECONDS * MS_IN_SECOND;

/** A dropped stream sends nothing: without its own tick the screen would keep the last snapshot as live. */
const TICK_SECONDS = 3;
const STALE_TICK = TICK_SECONDS * MS_IN_SECOND;

/**
 * The stream stopped sending snapshots after it had sent one. Before the first
 * snapshot the screen shows loading, not a stale stream.
 */
export function useStreamStale(sampledAt: number | null): boolean {
  const [checkedAt, setCheckedAt] = useState(() => Date.now());

  useEffect(function watchStreamFreshness() {
    const timer = setInterval(function checkStreamFreshness() {
      setCheckedAt(Date.now());
    }, STALE_TICK);

    return function stopStreamFreshness() {
      clearInterval(timer);
    };
  }, []);

  return sampledAt !== null && Math.max(checkedAt, sampledAt) - sampledAt >= STALE_AFTER;
}
