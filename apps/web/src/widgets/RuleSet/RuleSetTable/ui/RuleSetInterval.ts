import i18next, { type ParseKeys } from 'i18next';

import { parseDuration } from '@entities/RuleSet';
import { MS_IN_DAY, MS_IN_HOUR, MS_IN_MINUTE, MS_IN_WEEK } from '@shared/lib/time';

/** Order matters: the first unit that divides the interval evenly is taken. */
const INTERVAL_STEP = [
  { ms: MS_IN_WEEK, key: 'interval.week' },
  { ms: MS_IN_DAY, key: 'interval.day' },
  { ms: MS_IN_HOUR, key: 'interval.hour' },
  { ms: MS_IN_MINUTE, key: 'interval.minute' },
] as const satisfies readonly { ms: number; key: ParseKeys<'shared'> }[];

/**
 * Update interval in words: `24h` in the config and "once a day" on screen are the same
 * thing, but a router owner is not obliged to read the raw entry.
 *
 * An entry the format does not cover is returned as is: a human wrote it, and
 * the panel has no right to replace the unrecognized with a guess.
 */
export function formatUpdateInterval(interval: string): string {
  const ms = parseDuration(interval);

  if (ms === null || ms <= 0) {
    return interval;
  }

  for (const step of INTERVAL_STEP) {
    if (ms % step.ms === 0) {
      return i18next.t(step.key, { ns: 'shared', count: ms / step.ms });
    }
  }

  return interval;
}
