import i18next, { type ParseKeys } from 'i18next';

import { parseDuration } from '@entities/RuleSet';
import { MS_IN_DAY, MS_IN_HOUR, MS_IN_MINUTE, MS_IN_WEEK } from '@shared/lib/time';

/** Порядок значим: берётся первая единица, на которую интервал делится нацело. */
const INTERVAL_STEP = [
  { ms: MS_IN_WEEK, key: 'interval.week' },
  { ms: MS_IN_DAY, key: 'interval.day' },
  { ms: MS_IN_HOUR, key: 'interval.hour' },
  { ms: MS_IN_MINUTE, key: 'interval.minute' },
] as const satisfies readonly { ms: number; key: ParseKeys<'shared'> }[];

/**
 * Интервал обновления словами: `24h` в конфиге и «раз в сутки» на экране — одно
 * и то же, но сырую запись владелец роутера читать не обязан.
 *
 * Запись, которой формат не покрывает, отдаётся как есть: её писал человек, и
 * подменять непонятое догадкой панель не вправе.
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
