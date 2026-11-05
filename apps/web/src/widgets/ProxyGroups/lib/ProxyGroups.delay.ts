import type { TFunction } from 'i18next';

import { DELAY_TIMEOUT, type ProxyNode } from '@entities/Proxy';

export function toDelayText(t: TFunction<'widgets/ProxyGroups'>, node: ProxyNode): string {
  if (node.delay === null) {
    return t('delay.untested', { ns: 'shared' });
  }

  return node.delay >= DELAY_TIMEOUT
    ? t('delay.timedOut', { ns: 'shared' })
    : t('delay.value', { ns: 'shared', value: node.delay });
}
