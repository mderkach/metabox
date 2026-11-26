import type { Namespace, TFunction } from 'i18next';

import { SHARED_NS } from '@shared/i18n';

import { DELAY_TIMEOUT } from './Proxy.model';

/** Latency text of a node; a missing node and a `null` delay both mean the node was not tested. */
export function toDelayLabel(t: TFunction<Namespace>, node: { readonly delay: number | null } | undefined): string {
  const delay = node?.delay ?? null;

  if (delay === null) {
    return t('delay.untested', { ns: SHARED_NS });
  }

  // A connection failure, not a latency: the runtime returns it as the number 65535.
  return delay >= DELAY_TIMEOUT
    ? t('delay.timedOut', { ns: SHARED_NS })
    : t('delay.value', { ns: SHARED_NS, value: delay });
}
