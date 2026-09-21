import { useTranslation } from 'react-i18next';

import { useProxies, useProxyProviders } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';
import { CARD_FLUSH, Card, CardContent, CardHeader, SECTION_HEADING, SURFACE_HEAD } from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';
import { ProxyGroups } from '@widgets/ProxyGroups';

import { ProxyTestAll } from './ProxyTestAll';

/** `updatedAt` приходит в ISO; экрану нужна дата без времени. */
const ISO_DATE_LENGTH = 10;

export function ProxiesPage() {
  const { t } = useTranslation('pages/Proxies');
  const proxies = useProxies();
  const providers = useProxyProviders();

  const groups = proxies.data?.groups ?? [];
  const nodes = proxies.data?.standalone ?? [];
  const subscriptions = providers.data ?? [];

  return (
    <>
      <PageHeader title={t('title')} actions={<ProxyTestAll groups={groups} />}>
        <p className='text-xs text-muted-foreground'>{t('subtitle')}</p>
      </PageHeader>

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {proxies.isPending && <p className='text-sm text-muted-foreground'>{t('pending')}</p>}

        {proxies.isSuccess && (
          <section className='flex flex-col gap-3'>
            <h2 className={SECTION_HEADING}>{t('groups.title')}</h2>
            <ProxyGroups groups={groups} nodes={nodes} />
          </section>
        )}

        {/* Подписки — источник узлов, а не ещё одна их группа: отдельная секция
            со своим заголовком, а не карточка в общей стопке. */}
        {subscriptions.length > 0 && (
          <section className='flex flex-col gap-3'>
            <h2 className={SECTION_HEADING}>{t('providers.title')}</h2>
            <Card className={cn(CARD_FLUSH, 'overflow-hidden')}>
              <CardHeader className={cn('flex flex-row items-center gap-2.5', SURFACE_HEAD)}>
                <p className='text-xs text-muted-foreground'>{t('providers.subtitle')}</p>
              </CardHeader>
              <CardContent className='px-0'>
                <ul>
                  {subscriptions.map((provider) => (
                    <li key={provider.name} className='flex items-center gap-3 border-t border-border px-4 py-2.5'>
                      <span className='min-w-0 grow truncate text-sm'>{provider.name}</span>
                      <span className='text-xs text-muted-foreground'>
                        {t('count.node', { ns: 'shared', count: provider.nodes })}
                      </span>
                      <time dateTime={provider.updatedAt} className='font-mono text-xs text-muted-foreground'>
                        {provider.updatedAt.slice(0, ISO_DATE_LENGTH)}
                      </time>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
