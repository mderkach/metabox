import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useProxies, useProxyProviders } from '@entities/Proxy';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { CARD_FLUSH, Card, LiveRegion, QueryFailure, SURFACE, SkeletonRows } from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';
import { ProxyGroups } from '@widgets/ProxyGroups';

import { useMinuteClock } from '../lib/Proxies.lib';
import { ProxiesSection } from './ProxiesSection';
import { ProxyProviderRow } from './ProxyProviderRow';
import { ProxyTestAll } from './ProxyTestAll';

export function ProxiesPage() {
  const { t } = useTranslation('pages/Proxies');
  const proxies = useProxies();
  const providers = useProxyProviders();

  const groups = proxies.data?.groups ?? [];
  const nodes = proxies.data?.standalone ?? [];
  const subscriptions = providers.data ?? [];
  const now = useMinuteClock();

  // Результат действия видно глазами — отметка узла, число задержки, — а
  // скринридеру его объявляет одна область на экран.
  const { message, announce } = useLiveRegion();

  const onSelected = useCallback(
    (group: string, node: string) => {
      announce(t('announce.selected', { group, node }));
    },
    [announce, t]
  );

  const onTested = useCallback(
    (group: string) => {
      announce(t('announce.tested', { group }));
    },
    [announce, t]
  );

  const onTestedAll = useCallback(() => {
    announce(t('announce.testedAll'));
  }, [announce, t]);

  return (
    <>
      <PageHeader
        title={t('section.proxies', { ns: 'shared' })}
        actions={<ProxyTestAll groups={groups} onTested={onTestedAll} />}
      />

      <LiveRegion message={message} />

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {proxies.isPending && <SkeletonRows className={SURFACE} />}

        {proxies.isLoadingError && <QueryFailure messageKey='source.proxies' query={proxies} />}

        {proxies.isSuccess && (
          <ProxiesSection title={t('groups.title')}>
            <ProxyGroups groups={groups} nodes={nodes} onSelected={onSelected} onTested={onTested} />
          </ProxiesSection>
        )}

        {/* Подписки — источник узлов, а не ещё одна их группа: отдельная секция
            со своим заголовком, а не карточка в общей стопке. Своей шапки у
            карточки нет: заголовок уже у секции, а повторять его незачем. */}
        {subscriptions.length > 0 && (
          <ProxiesSection title={t('providers.title')}>
            <Card className={CARD_FLUSH}>
              <ul className='divide-y divide-border'>
                {subscriptions.map((provider) => (
                  <ProxyProviderRow key={provider.name} provider={provider} now={now} />
                ))}
              </ul>
            </Card>
          </ProxiesSection>
        )}
      </div>
    </>
  );
}
