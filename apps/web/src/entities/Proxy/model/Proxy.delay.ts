import type { Namespace, TFunction } from 'i18next';

import { DELAY_TIMEOUT } from './Proxy.model';

/** Latency text of a node; a missing node and a `null` delay both mean the node was not tested. */
export function toDelayLabel(t: TFunction<Namespace>, node: { readonly delay: number | null } | undefined): string {
  const delay = node?.delay ?? null;

  if (delay === null) {
    return t('delay.untested', { ns: 'shared' });
  }

  // A connection failure, not a latency: the runtime returns it as the number 65535.
  return delay >= DELAY_TIMEOUT
    ? t('delay.timedOut', { ns: 'shared' })
    : t('delay.value', { ns: 'shared', value: delay });
}
