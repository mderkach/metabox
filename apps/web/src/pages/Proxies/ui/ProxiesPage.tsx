import { useTranslation } from 'react-i18next';

import { useProxies, useProxyProviders } from '@entities/Proxy';
import { formatDate } from '@shared/lib/format';
import { CARD_FLUSH, Card, QueryFailure, SURFACE, SkeletonRows } from '@shared/ui';
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

  return (
    <>
      <PageHeader title={t('section.proxies', { ns: 'shared' })} actions={<ProxyTestAll groups={groups} />} />

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {proxies.isPending && <SkeletonRows className={SURFACE} />}

        {proxies.isLoadingError && <QueryFailure messageKey='source.proxies' query={proxies} />}

        {proxies.isSuccess && (
          <ProxiesSection
            title={t('groups.title')}
            note={groups.some((group) => group.selectable) ? t('groups.note') : undefined}
          >
            <ProxyGroups groups={groups} nodes={nodes} />
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
