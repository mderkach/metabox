import type { ParseKeys } from 'i18next';

import { REFRESH_INTERVAL, type RefreshInterval } from './';

export const REFRESH_OPTIONS = [
  { interval: REFRESH_INTERVAL.Live, label: 'refresh.live' },
  { interval: REFRESH_INTERVAL.Slow, label: 'refresh.slow' },
  { interval: REFRESH_INTERVAL.Slower, label: 'refresh.slower' },
] as const satisfies readonly { interval: RefreshInterval; label: ParseKeys<'widgets/ConnectionTable'> }[];

export function toInterval(value: string | null): RefreshInterval {
  const option = REFRESH_OPTIONS.find((entry) => String(entry.interval) === value);

  return option === undefined ? REFRESH_INTERVAL.Live : option.interval;
}
