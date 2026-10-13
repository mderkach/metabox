import { useTranslation } from 'react-i18next';

import type { ProxyGroup } from '@entities/Proxy';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
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
  const delay = useTestProxyDelay();

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={groups.length === 0 || delay.isPending}
      onClick={() => {
        // The `mutate` callback fires only for the last call, so
        // the announcement waits for all measurements at once, not for the last one started.
        void Promise.allSettled(groups.map(async (group) => delay.mutateAsync(group.name))).then(
          function announceTested(results) {
            if (results.every((result) => result.status === 'fulfilled')) {
              onTested();
            }
          }
        );
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: 'shared' }) : t('testAll.action')}
    </Button>
  );
}
