import type { TFunction } from 'i18next';

import { HOURS_IN_DAY, SECONDS_IN_HOUR, SECONDS_IN_MINUTE } from '@shared/lib/time';

export function formatUptime(t: TFunction<'widgets/Daemon/DaemonService'>, seconds: number): string {
  if (seconds < SECONDS_IN_MINUTE) {
    return t('uptime.underMinute');
  }

  if (seconds < SECONDS_IN_HOUR) {
    return t('uptime.minutes', { minutes: Math.floor(seconds / SECONDS_IN_MINUTE) });
  }

  const hours = Math.floor(seconds / SECONDS_IN_HOUR);

  return hours >= HOURS_IN_DAY
    ? t('uptime.days', { days: Math.floor(hours / HOURS_IN_DAY), hours: hours % HOURS_IN_DAY })
    : t('uptime.hours', { hours });
}
