import { useTranslation } from 'react-i18next';

import type { ProviderNodeChange, ProxyProvider } from '@entities/Proxy';
import { ProxyProviderUpdate } from '@features/Proxy/ProxyProviderUpdate';
import { formatBytes, formatDate } from '@shared/lib/format';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';
import { ProxiesProviderUpdatedAt } from './ProxiesProviderUpdatedAt';
import { ProxyProviderNodeDrop } from './ProxyProviderNodeDrop';
import { ProxyProviderNodes } from './ProxyProviderNodes';

export function ProxyProviderRow({
  provider,
  change,
  now,
}: {
  provider: ProxyProvider;
  change: ProviderNodeChange;
  now: number;
}) {
  const { t } = useTranslation(PROXIES_NS);
  const { usage, expiresAt } = provider;

  return (
    <li className='flex flex-col gap-1.5 px-(--card-spacing) py-2.5'>
      <div className='flex items-center gap-3'>
        <div className='min-w-0 grow'>
          <p className='truncate text-sm'>{provider.name}</p>
          <p className='flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
            <ProxyProviderNodes change={change} />
            <ProxiesProviderUpdatedAt update={provider.update} now={now} />
            {usage !== null && (
              <span className='tabular-nums'>
                {usage.total > 0
                  ? t('providers.usage', { used: formatBytes(usage.used), total: formatBytes(usage.total) })
                  : t('providers.usageUnlimited', { used: formatBytes(usage.used) })}
              </span>
            )}
            {expiresAt !== null && (
              <time dateTime={expiresAt.toISOString()} className='tabular-nums'>
                {t('providers.expires', { date: formatDate(expiresAt) })}
              </time>
            )}
          </p>
        </div>
        <ProxyProviderUpdate name={provider.name} />
      </div>
      <ProxyProviderNodeDrop change={change} />
    </li>
  );
}
