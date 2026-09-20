import { useTranslation } from 'react-i18next';

import { useProxies, useProxyProviders } from '@entities/Proxy';
import { Card, CardContent, CardHeader } from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';
import { ProxyGroups } from '@widgets/ProxyGroups';

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
      <PageHeader title={t('title')}>
        <p className='text-xs text-muted-foreground'>{t('subtitle')}</p>
      </PageHeader>

      <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {proxies.isPending && <p className='text-sm text-muted-foreground'>{t('pending')}</p>}

        {proxies.isSuccess && <ProxyGroups groups={groups} nodes={nodes} />}

        {subscriptions.length > 0 && (
          <Card className='gap-0 overflow-hidden py-0'>
            <CardHeader className='flex flex-row items-center gap-2.5 border-b border-border px-4 py-3'>
              <h2 className='text-sm font-medium'>{t('providers.title')}</h2>
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
        )}
      </div>
    </>
  );
}
