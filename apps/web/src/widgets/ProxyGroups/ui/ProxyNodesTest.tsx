import { useTranslation } from 'react-i18next';

import { useTestProxyDelays } from '@features/Proxy/ProxyDelay';
import { Button } from '@shared/ui';

/** Probes every listed node: a group probe would measure only the node the group uses now. */
export function ProxyNodesTest({
  names,
  label,
  onTested,
}: {
  names: readonly string[];
  /** The accessible name tells apart identical "Test" buttons of neighbouring cards. */
  label: string;
  onTested: () => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const delay = useTestProxyDelays();

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={names.length === 0 || delay.isPending}
      aria-label={label}
      onClick={() => {
        void delay.test(names).then(function announceTested(success) {
          if (success) onTested();
        });
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: 'shared' }) : t('delay.test', { ns: 'shared' })}
    </Button>
  );
}
