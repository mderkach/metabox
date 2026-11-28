import { Trans, useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Badge } from '@shared/ui';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { OUTBOUND_KIND, type OverviewOutbound } from '../model/Overview.outbounds';
import { OverviewOutboundName } from './OverviewOutboundName';

export function OverviewOutboundIdentity({
  row,
  quiet,
}: {
  row: Pick<OverviewOutbound, 'name' | 'kind' | 'group' | 'nested' | 'latency'>;
  quiet: boolean;
}) {
  const { t } = useTranslation(OVERVIEW_NS);

  return (
    <div role='cell' className='col-span-full min-w-0 space-y-1 lg:col-span-1'>
      <div
        className={cn(
          'text-sm font-semibold',
          quiet && 'text-muted-foreground',
          !quiet && row.kind === OUTBOUND_KIND.Direct && 'text-route-direct',
          !quiet && row.kind === OUTBOUND_KIND.Block && 'text-route-block',
          !quiet && row.kind === OUTBOUND_KIND.Dns && 'text-route-dns',
          !quiet && (row.kind === OUTBOUND_KIND.Group || row.kind === OUTBOUND_KIND.Server) && 'text-route-proxy'
        )}
      >
        <OverviewOutboundName tag={row.name.tag} label={row.name.label} stacked={row.name.label !== undefined} />
      </div>
      <div className='space-y-1 text-xs text-muted-foreground'>
        {row.kind === OUTBOUND_KIND.Group && (
          <Badge variant='outline' className='rounded-md px-1.5'>
            {t('outbounds.kind.group')}
          </Badge>
        )}
        {row.kind !== OUTBOUND_KIND.Unknown && row.kind !== OUTBOUND_KIND.Group && (
          <p>{t(`outbounds.kind.${row.kind}`)}</p>
        )}
        {row.group !== null && <p>{t(`outbounds.choice.${row.group.choice}`, { count: row.group.count })}</p>}
        {row.nested.map((group) => (
          <div key={group.tag}>
            <p className='flex min-w-0 flex-wrap items-baseline gap-x-1'>
              <Trans
                t={t}
                i18nKey='outbounds.selectedGroup'
                components={{
                  name: (
                    <OverviewOutboundName
                      tag={group.tag}
                      label={group.label}
                      className={cn(!quiet && 'text-route-proxy')}
                    />
                  ),
                }}
              />
            </p>
            <p>{t(`outbounds.choice.${group.choice}`, { count: group.count })}</p>
          </div>
        ))}
        {row.group !== null && row.latency !== null && (
          <p className='flex min-w-0 flex-wrap items-baseline gap-x-1'>
            <Trans
              t={t}
              i18nKey='outbounds.activeServer'
              components={{
                name: (
                  <OverviewOutboundName
                    tag={row.latency.server.tag}
                    label={row.latency.server.label}
                    className={cn(quiet ? 'text-foreground' : 'text-route-proxy')}
                  />
                ),
              }}
            />
          </p>
        )}
      </div>
    </div>
  );
}
