import { useTranslation } from 'react-i18next';

import type { SystemStat } from '@entities/Daemon';
import { ROUTE_ORIGIN, RouteOriginBadge } from '@entities/Route';
import { formatBytes } from '@shared/lib/format';
import { Card, SkeletonRows } from '@shared/ui';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { toTrafficShares } from '../model/Overview.traffic';
import { OverviewBlockedConnections } from './OverviewBlockedConnections';
import { OverviewTrafficHelp } from './OverviewTrafficHelp';

export function OverviewTrafficShares({ system, stopped }: { system: SystemStat | null; stopped: boolean }) {
  const { t } = useTranslation(OVERVIEW_NS);

  if (system === null) {
    return (
      <Card className='gap-3 px-4 py-3'>
        <p className='text-sm text-muted-foreground'>{t('traffic.waiting')}</p>
        <SkeletonRows rows={2} className='p-0' />
      </Card>
    );
  }

  const { proxy, direct, bypass, total, proxyRatio, proxyPercent, directPercent } = toTrafficShares(system.share);

  return (
    <Card role='group' aria-label={t('traffic.shares')} className='@container gap-3 px-4 py-3'>
      {stopped && <p className='text-sm text-muted-foreground'>{t('traffic.history')}</p>}
      <div aria-hidden className='flex h-2 overflow-hidden rounded-full bg-meter-track'>
        {total > 0 && (
          <>
            <span className='bg-route-proxy' style={{ flexGrow: proxyRatio }} />
            <span className='bg-route-direct' style={{ flexGrow: 1 - proxyRatio }} />
          </>
        )}
      </div>
      <dl className='grid gap-x-8 gap-y-1 text-sm @2xl:grid-cols-2'>
        <div className='grid items-start gap-x-2 @3xs:grid-cols-[minmax(0,1fr)_auto]'>
          <dt className='flex min-h-7 items-center gap-2 font-medium pointer-coarse:min-h-11'>
            <span aria-hidden className='size-2 shrink-0 self-center rounded-full bg-route-proxy' />
            {t('traffic.proxy')}
          </dt>
          <dd className='flex min-h-7 flex-wrap items-center justify-end gap-x-2 text-right font-mono tabular-nums pointer-coarse:min-h-11'>
            <data value={proxy} className='font-semibold'>
              {formatBytes(proxy)}
            </data>
            <span className='min-w-[4ch] text-muted-foreground'>{t('traffic.percent', { percent: proxyPercent })}</span>
          </dd>
        </div>
        <div className='grid items-start gap-x-2 @3xs:grid-cols-[minmax(0,1fr)_auto]'>
          <dt className='flex min-h-7 flex-wrap items-center gap-x-1 font-medium pointer-coarse:min-h-11'>
            <span className='inline-flex items-center gap-2'>
              <span aria-hidden className='size-2 shrink-0 rounded-full bg-route-direct' />
              {t('traffic.direct')}
            </span>
            <OverviewTrafficHelp
              label={t('traffic.directLabel')}
              mark={<RouteOriginBadge origin={ROUTE_ORIGIN.Computed} />}
            >
              {t('traffic.directHelp', { volume: formatBytes(bypass) })}
            </OverviewTrafficHelp>
          </dt>
          <dd className='flex min-h-7 flex-wrap items-center justify-end gap-x-2 text-right font-mono tabular-nums pointer-coarse:min-h-11'>
            <data value={direct} className='font-semibold'>
              {formatBytes(direct)}
            </data>
            <span className='min-w-[4ch] text-muted-foreground'>
              {t('traffic.percent', { percent: directPercent })}
            </span>
          </dd>
        </div>
      </dl>
      <div className='flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border pt-2'>
        <OverviewBlockedConnections blocked={system.blocked} />
        <p className='text-sm text-muted-foreground'>{t('traffic.total', { volume: formatBytes(total) })}</p>
      </div>
    </Card>
  );
}
