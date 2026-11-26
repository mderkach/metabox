import { useTranslation } from 'react-i18next';

import { useTestProxyDelays } from '@features/Proxy/ProxyDelay';
import { SHARED_NS } from '@shared/i18n';
import { Button } from '@shared/ui';

import { PROXY_GROUPS_NS } from '../i18n/ProxyGroups.namespace.generated';

/** Probes every listed node: a group probe would measure only the node the group uses now. */
export function ProxyNodesTest({
  names,
  label,
  onTested,
  onTestStart,
}: {
  names: readonly string[];
  /** The accessible name tells apart identical "Test" buttons of neighbouring cards. */
  label: string;
  onTested: () => void;
  onTestStart?: (() => void) | undefined;
}) {
  const { t } = useTranslation(PROXY_GROUPS_NS);
  const delay = useTestProxyDelays();

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={names.length === 0 || delay.isPending}
      aria-label={label}
      onClick={() => {
        onTestStart?.();
        void delay.test(names).then(function announceTested(success) {
          if (success) onTested();
        });
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: SHARED_NS }) : t('delay.test', { ns: SHARED_NS })}
    </Button>
  );
}
