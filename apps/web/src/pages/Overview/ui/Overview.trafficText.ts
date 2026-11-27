import type { TFunction } from 'i18next';

import { formatRate } from '@shared/lib/format';

import type { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { CORE_GAP, type CoreGap } from '../lib/Overview.lib';

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
