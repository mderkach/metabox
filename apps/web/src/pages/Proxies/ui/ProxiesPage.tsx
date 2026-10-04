import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useProxies, useProxyProviders } from '@entities/Proxy';
import { formatDate } from '@shared/lib/format';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { CARD_FLUSH, Card, LiveRegion, QueryFailure, SURFACE, SkeletonRows } from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';
import { ProxyGroups } from '@widgets/ProxyGroups';

import { ProxiesSection } from './ProxiesSection';
import { ProxyTestAll } from './ProxyTestAll';

export function ProxiesPage() {
  const { t } = useTranslation('pages/Proxies');
  const proxies = useProxies();
  const providers = useProxyProviders();

  const groups = proxies.data?.groups ?? [];
  const nodes = proxies.data?.standalone ?? [];
  const subscriptions = providers.data ?? [];

  // Результат действия видно глазами — отметка узла, число задержки, — а
  // скринридеру его объявляет одна область на экран.
  const live = useLiveRegion();
  const { announce } = live;

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

      <LiveRegion message={live.message} />

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {proxies.isPending && <SkeletonRows className={SURFACE} />}

        {proxies.isLoadingError && <QueryFailure messageKey='source.proxies' query={proxies} />}

        {proxies.isSuccess && (
          <ProxiesSection
            title={t('groups.title')}
            note={groups.some((group) => group.selectable) ? t('groups.note') : undefined}
          >
            <ProxyGroups groups={groups} nodes={nodes} onSelected={onSelected} onTested={onTested} />
          </ProxiesSection>
        )}

        {/* Подписки — источник узлов, а не ещё одна их группа: отдельная секция
            со своим заголовком, а не карточка в общей стопке. Своей шапки у
            карточки нет: заголовок уже у секции, а повторять его незачем. */}
        {subscriptions.length > 0 && (
          <ProxiesSection title={t('providers.title')} note={t('providers.note')}>
            <Card className={CARD_FLUSH}>
              <ul className='divide-y divide-border'>
                {subscriptions.map((provider) => (
                  <li key={provider.name} className='flex items-center gap-3 px-(--card-spacing) py-2.5'>
                    <span className='min-w-0 grow truncate text-sm'>{provider.name}</span>
                    <span className='text-xs text-muted-foreground'>
                      {t('count.node', { ns: 'shared', count: provider.nodes })}
                    </span>
                    <time dateTime={provider.updatedAt} className='text-xs text-muted-foreground tabular-nums'>
                      {toProviderDate(provider.updatedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </Card>
          </ProxiesSection>
        )}
      </div>
    </>
  );
}

/** Схема формат строки не проверяет: неразобранную дату показываем как пришла, а не «Invalid Date». */
function toProviderDate(updatedAt: string): string {
  const at = new Date(updatedAt);

  return Number.isNaN(at.getTime()) ? updatedAt : formatDate(at);
}
