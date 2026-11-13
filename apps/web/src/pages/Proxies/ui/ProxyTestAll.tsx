import { useTranslation } from 'react-i18next';

import type { ProxyGroup, ProxyNode } from '@entities/Proxy';
import { useTestProxyDelays } from '@features/Proxy/ProxyDelay';
import { Button } from '@shared/ui';

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
}: {
  groups: ProxyGroup[];
  nodes: ProxyNode[];
  /** The measurement passed in all groups: a failure in at least one shows an error toast. */
  onTested: () => void;
}) {
  const { t } = useTranslation('pages/Proxies');
  const delay = useTestProxyDelays();
  const names = [...groups.flatMap((group) => group.nodes), ...nodes].map((node) => node.name);

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={names.length === 0 || delay.isPending}
      onClick={() => {
        void delay.test(names).then(function announceTested(success) {
          if (success) onTested();
        });
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: 'shared' }) : t('testAll.action')}
    </Button>
  );
}
