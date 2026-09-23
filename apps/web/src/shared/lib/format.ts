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

/** Байты человеку: рантайм отдаёт их числом, а колонки узкие. */
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

/** Скорость за секунду: та же шкала, другая подпись. */
export function formatRate(bytesPerSecond: number): string {
  return i18next.t('unit.rate', { ns: 'shared', value: formatBytes(bytesPerSecond) });
}

/**
 * Сколько прошло, коротко: колонка узкая, а точность до секунды нужна только на
 * первой минуте. Возраст считается от переданного момента, а не от `Date.now()`
 * внутри, — иначе значение менялось бы между рендерами одного снапшота.
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
 * Дата одним форматом на всю панель. Порядок частей задаёт язык интерфейса, а
 * не браузера: иначе английская панель в русской системе печатала бы даты
 * по-русски.
 */
export function formatDate(at: Date): string {
  return at.toLocaleDateString(i18next.language, DATE_PARTS);
}

/** Дата с временем до минуты, в том же формате даты, что `formatDate`. */
export function formatDateTime(at: Date): string {
  return at.toLocaleString(i18next.language, { ...DATE_PARTS, ...TIME_PARTS });
}
