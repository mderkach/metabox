import { useState } from 'react';

import { toStickyCeiling } from './chart';

/** A scale edge that does not dance after a live quantity (`toStickyCeiling`). */
export function useStickyCeiling(needed: number): number {
  const [ceiling, setCeiling] = useState(needed);
  const next = toStickyCeiling(ceiling, needed);

  if (next !== ceiling) {
    setCeiling(next);
  }

  return next;
}
