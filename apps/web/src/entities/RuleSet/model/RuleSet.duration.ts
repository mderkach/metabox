import {
  MS_IN_DAY,
  MS_IN_HOUR,
  MS_IN_MINUTE,
  MS_IN_SECOND,
  MS_IN_WEEK,
  NS_IN_SECOND,
  US_IN_SECOND,
} from '@shared/lib/time';

/** Ключи — суффиксы самого формата, поэтому они и записаны как в нём. */
const MS_IN_UNIT: Readonly<Record<string, number>> = {
  ns: MS_IN_SECOND / NS_IN_SECOND,
  us: MS_IN_SECOND / US_IN_SECOND,
  µs: MS_IN_SECOND / US_IN_SECOND,
  ms: 1,
  s: MS_IN_SECOND,
  m: MS_IN_MINUTE,
  h: MS_IN_HOUR,
  d: MS_IN_DAY,
  w: MS_IN_WEEK,
};

/**
 * Набор единиц повторяет ограничение поля `update_interval` в генерируемой
 * схеме. Повтор осознанный: панель обязана отвергать ровно то, что отвергнет
 * бинарь, — пропущенная строка обрывает старт sing-box, а лишний отказ закрывает
 * запись, которую он принял бы.
 */
const DURATION = /^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/u;
const DURATION_PART = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d|w)/gu;

/** Длительность sing-box в миллисекундах; `null` — запись не в том формате. */
export function parseDuration(text: string): number | null {
  const value = text.trim();

  if (!DURATION.test(value)) {
    return null;
  }

  let total = 0;

  for (const [, amount, unit] of value.matchAll(DURATION_PART)) {
    total += Number(amount) * MS_IN_UNIT[unit];
  }

  return value.startsWith('-') ? -total : total;
}
