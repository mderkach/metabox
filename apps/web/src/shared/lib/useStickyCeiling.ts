import { useState } from 'react';

import { toStickyCeiling } from './chart';

/** Кромка шкалы, которая не пляшет вслед за живой величиной (`toStickyCeiling`). */
export function useStickyCeiling(needed: number): number {
  const [ceiling, setCeiling] = useState(needed);
  const next = toStickyCeiling(ceiling, needed);

  if (next !== ceiling) {
    setCeiling(next);
  }

  return next;
}
