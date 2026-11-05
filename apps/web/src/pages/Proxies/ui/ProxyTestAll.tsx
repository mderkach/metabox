import { useTranslation } from 'react-i18next';

import type { ProxyGroup } from '@entities/Proxy';
import { useTestProxyDelays } from '@features/Proxy/ProxyDelay';
import { Button } from '@shared/ui';

/**
 * Measurement across all groups at once.
 *
 * Placed in the screen header, not in a card: a card button works with its own
 * group, and an action over all of them does not fit into one of them.
 */
export function ProxyTestAll({
  groups,
  onTested,
}: {
  groups: ProxyGroup[];
  /** The measurement passed in all groups: a failure in at least one shows an error toast. */
  onTested: () => void;
}) {
  const { t } = useTranslation('pages/Proxies');
  const delay = useTestProxyDelays();

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={groups.length === 0 || delay.isPending}
      onClick={() => {
        void delay.test(groups.map((group) => group.name)).then(function announceTested(success) {
          if (success) onTested();
        });
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: 'shared' }) : t('testAll.action')}
    </Button>
  );
}
