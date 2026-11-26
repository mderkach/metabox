import { useTranslation } from 'react-i18next';

import type { ProxyGroup, ProxyNode } from '@entities/Proxy';
import { useTestProxyDelays } from '@features/Proxy/ProxyDelay';
import { SHARED_NS } from '@shared/i18n';
import { Button } from '@shared/ui';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';

/**
 * Measurement of every node on the screen: the members of all groups and, without
 * groups, the config outbounds. A group probe would measure only its current node.
 *
 * Placed in the screen header, not in a card: a card button works with its own
 * group, and an action over all of them does not fit into one of them.
 */
export function ProxyTestAll({
  groups,
  nodes,
  onTested,
  onTestStart,
}: {
  groups: ProxyGroup[];
  nodes: ProxyNode[];
  /** The measurement passed in all groups: a failure in at least one shows an error toast. */
  onTested: () => void;
  onTestStart?: (() => void) | undefined;
}) {
  const { t } = useTranslation(PROXIES_NS);
  const delay = useTestProxyDelays();
  const names = [...groups.flatMap((group) => group.nodes), ...nodes].map((node) => node.name);

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={names.length === 0 || delay.isPending}
      onClick={() => {
        onTestStart?.();
        void delay.test(names).then(function announceTested(success) {
          if (success) onTested();
        });
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: SHARED_NS }) : t('testAll.action')}
    </Button>
  );
}
