import type { TFunction } from 'i18next';

import { formatBytes, formatRate } from '@shared/lib/format';

export function toVolume(pending: boolean, bytes: number): string | null {
  if (pending) {
    return null;
  }

  return bytes > 0 ? formatBytes(bytes) : '—';
}

export function toPeak(t: TFunction<'pages/Overview'>, peak: number): string {
  return peak > 0 ? t('traffic.peak', { value: formatRate(peak) }) : t('traffic.noPeak');
}
