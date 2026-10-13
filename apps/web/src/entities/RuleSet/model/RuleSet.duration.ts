import {
  MS_IN_DAY,
  MS_IN_HOUR,
  MS_IN_MINUTE,
  MS_IN_SECOND,
  MS_IN_WEEK,
  NS_IN_SECOND,
  US_IN_SECOND,
} from '@shared/lib/time';

/** Keys are the suffixes of the format itself, so they are written as in it. */
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
 * The unit set repeats the `update_interval` field constraint in the generated
 * schema. The repeat is deliberate: the panel must reject exactly what the
 * binary will reject, since a passed string aborts sing-box start, while an
 * extra refusal blocks an entry it would have accepted.
 */
const DURATION = /^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/u;
const DURATION_PART = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d|w)/gu;

/** sing-box duration in milliseconds; `null` means the entry is not in that format. */
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
