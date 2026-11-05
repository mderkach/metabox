import type { TFunction } from 'i18next';

import { DELAY_TIMEOUT, type ProxyNode } from '@entities/Proxy';

export function toDelayLabel(t: TFunction<'pages/Overview'>, node: ProxyNode | undefined): string {
  const delay = node?.delay ?? null;

  if (delay === null) {
    return t('delay.untested', { ns: 'shared' });
  }

  // A connection failure, not a latency: the runtime returns it as the number 65535.
  return delay >= DELAY_TIMEOUT
    ? t('delay.timedOut', { ns: 'shared' })
    : t('delay.value', { ns: 'shared', value: delay });
}
