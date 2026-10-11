import { useTranslation } from 'react-i18next';

import type { ProviderUpdate, ProxyProvider } from '@entities/Proxy';
import { formatAge, formatBytes, formatDate, formatDateTime } from '@shared/lib/format';
import { MS_IN_SECOND, SECONDS_IN_MINUTE } from '@shared/lib/time';

import { ProxyProviderUpdate } from './ProxyProviderUpdate';

function ProviderUpdatedAt({ update, now }: { update: ProviderUpdate; now: number }) {
  const { t } = useTranslation('pages/Proxies');

  if (update.kind === 'never') {
    return <span>{t('providers.neverUpdated')}</span>;
  }

  if (update.kind === 'unknown') {
    return <span title={update.raw}>{t('providers.updatedUnknown')}</span>;
  }

  const ageSeconds = (now - update.at.getTime()) / MS_IN_SECOND;
  const label =
    ageSeconds < SECONDS_IN_MINUTE
      ? t('providers.updatedNow')
      : t('providers.updatedAgo', { age: formatAge(ageSeconds) });

  return (
    <time dateTime={update.raw} title={formatDateTime(update.at)}>
      {label}
    </time>
  );
}

export function ProxyProviderRow({ provider, now }: { provider: ProxyProvider; now: number }) {
  const { t } = useTranslation('pages/Proxies');
  const { usage, expiresAt } = provider;

  return (
    <li className='flex items-center gap-3 px-(--card-spacing) py-2.5'>
      <div className='min-w-0 grow'>
        <p className='truncate text-sm'>{provider.name}</p>
        <p className='flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
          <span>{t('count.node', { ns: 'shared', count: provider.nodes })}</span>
          <ProviderUpdatedAt update={provider.update} now={now} />
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
    </li>
  );
}
