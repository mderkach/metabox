import type { TFunction } from 'i18next';

import { formatBytes, formatRate } from '@shared/lib/format';

import type { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { CORE_GAP, type CoreGap } from './Overview.lib';

export function toVolume(pending: boolean, bytes: number): string | null {
  if (pending) {
    return null;
  }

  return bytes > 0 ? formatBytes(bytes) : '—';
}

/** Rejected bytes go into the direct tile context: the fork does not list a rejected connection, so the volume is rarely above zero. */
export function toDirectContext(
  t: TFunction<typeof OVERVIEW_NS>,
  link: number,
  percent: number,
  rejected: number
): string {
  if (link <= 0) {
    return t('traffic.linkUnknown');
  }

  return rejected > 0
    ? t('traffic.linkShareRejected', { percent, volume: formatBytes(rejected) })
    : t('traffic.linkShare', { percent });
}

export function toRate(awaiting: boolean, rate: number): string | null {
  return awaiting ? null : formatRate(rate);
}

export function toRateContext(
  t: TFunction<typeof OVERVIEW_NS>,
  awaiting: boolean,
  gap: CoreGap | null,
  peak: number
): string | null {
  if (gap !== null) {
    return t('traffic.noData');
  }

  return awaiting ? null : toPeak(t, peak);
}

export function toCoreGapText(t: TFunction<typeof OVERVIEW_NS>, gap: CoreGap): string {
  return gap === CORE_GAP.Stopped ? t('coreGap.stopped') : t('coreGap.silent');
}

export function toPeak(t: TFunction<typeof OVERVIEW_NS>, peak: number): string {
  return peak > 0 ? t('traffic.peak', { value: formatRate(peak) }) : t('traffic.noPeak');
}
