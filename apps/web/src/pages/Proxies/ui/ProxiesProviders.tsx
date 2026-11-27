import { useTranslation } from 'react-i18next';

import { useProviderNodeChanges, useProxyProviders } from '@entities/Proxy';
import { CARD_FLUSH, Card, QueryFailure, SURFACE, SkeletonRows } from '@shared/ui';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';
import { useMinuteClock } from '../lib/Proxies.lib';
import { ProxiesSection } from './ProxiesSection';
import { ProxyProviderRow } from './ProxyProviderRow';

export function ProxiesProviders() {
  const { t } = useTranslation(PROXIES_NS);
  const providers = useProxyProviders();
  const subscriptions = providers.data ?? [];
  const toNodeChange = useProviderNodeChanges(providers.data);
  const now = useMinuteClock();

  return (
    <>
      {providers.isPending && <SkeletonRows className={SURFACE} />}

      {providers.isLoadingError && <QueryFailure messageKey='source.providers' query={providers} />}

      {subscriptions.length > 0 && (
        <ProxiesSection title={t('providers.title')}>
          <Card className={CARD_FLUSH}>
            <ul className='divide-y divide-border'>
              {subscriptions.map((provider) => (
                <ProxyProviderRow key={provider.name} provider={provider} change={toNodeChange(provider)} now={now} />
              ))}
            </ul>
          </Card>
        </ProxiesSection>
      )}
    </>
  );
}
