import i18next, { type ParseKeys } from 'i18next';

import { HOURS_IN_DAY, MINUTES_IN_HOUR, SECONDS_IN_MINUTE } from './time';

const BYTE_UNITS = [
  'unit.byte',
  'unit.kilobyte',
  'unit.megabyte',
  'unit.gigabyte',
  'unit.terabyte',
] as const satisfies readonly ParseKeys<'shared'>[];
const BYTE_STEP = 1024;

/** Bytes for a human: the runtime returns them as a number, and the columns are narrow. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;

  while (value >= BYTE_STEP && unit < BYTE_UNITS.length - 1) {
    value /= BYTE_STEP;
    unit += 1;
  }

  const amount = unit === 0 ? String(Math.round(value)) : value.toFixed(1);

  return `${amount} ${i18next.t(BYTE_UNITS[unit], { ns: 'shared' })}`;
}

/** Speed per second: the same scale, a different label. */
export function formatRate(bytesPerSecond: number): string {
  return i18next.t('unit.rate', { ns: 'shared', value: formatBytes(bytesPerSecond) });
}

/**
 * How long ago, short: the column is narrow, and second precision is needed only in
 * the first minute. Age is counted from the passed moment, not from `Date.now()`
 * inside — otherwise the value would change between renders of one snapshot.
 */
export function formatAge(seconds: number): string {
  if (seconds < SECONDS_IN_MINUTE) {
    return i18next.t('unit.second', { ns: 'shared', value: Math.max(0, Math.floor(seconds)) });
  }

  const minutes = Math.floor(seconds / SECONDS_IN_MINUTE);

  if (minutes < MINUTES_IN_HOUR) {
    return i18next.t('unit.minute', { ns: 'shared', value: minutes });
  }

  const hours = Math.floor(minutes / MINUTES_IN_HOUR);

  return hours < HOURS_IN_DAY
    ? i18next.t('unit.hour', { ns: 'shared', value: hours })
    : i18next.t('unit.day', { ns: 'shared', value: Math.floor(hours / HOURS_IN_DAY) });
}

const DATE_PARTS = { day: '2-digit', month: '2-digit', year: 'numeric' } as const satisfies Intl.DateTimeFormatOptions;
const TIME_PARTS = { hour: '2-digit', minute: '2-digit' } as const satisfies Intl.DateTimeFormatOptions;

/**
 * A date in one format for the whole panel. The order of parts is set by the interface language, not
 * by the browser: otherwise an English panel on a Russian system would print dates
 * the Russian way.
 */
export function formatDate(at: Date): string {
  return at.toLocaleDateString(i18next.language, DATE_PARTS);
}

/** Date with time down to the minute, in the same date format as `formatDate`. */
export function formatDateTime(at: Date): string {
  return at.toLocaleString(i18next.language, { ...DATE_PARTS, ...TIME_PARTS });
}
