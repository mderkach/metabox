import type { TFunction } from 'i18next';

import { DELAY_TIMEOUT, type ProxyNode } from '@entities/Proxy';

export function toDelayLabel(t: TFunction<'widgets/ProxyLatency'>, node: ProxyNode): string {
  if (node.delay === null) {
    return t('delay.untested', { ns: 'shared' });
  }

  // A connection failure, not a latency: the runtime returns it as the number 65535.
  return node.delay >= DELAY_TIMEOUT
    ? t('delay.timedOut', { ns: 'shared' })
    : t('delay.value', { ns: 'shared', value: node.delay });
}
