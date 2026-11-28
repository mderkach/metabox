import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ROUTE_ORIGIN, RouteOriginBadge } from '@entities/Route';
import { formatRate } from '@shared/lib/format';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { OutboundRate } from '../model/Overview.outbounds';

export function OverviewOutboundRate({ rate }: { rate: OutboundRate | null }) {
  const { t } = useTranslation(OVERVIEW_NS);

  return (
    <div role='cell' className='min-w-0 space-y-1 text-xs'>
      <p className='text-muted-foreground lg:sr-only'>{t('outbounds.rate')}</p>
      {rate?.kind === 'directional' && (
        <>
          <p className='flex items-center gap-1 font-mono tabular-nums'>
            <ArrowDown aria-hidden='true' className='size-3.5 shrink-0 text-series-down' />
            <span className='sr-only'>{t('outbounds.download')}</span>
            <data value={rate.down}>{formatRate(rate.down)}</data>
          </p>
          <p className='flex items-center gap-1 font-mono tabular-nums'>
            <ArrowUp aria-hidden='true' className='size-3.5 shrink-0 text-series-up' />
            <span className='sr-only'>{t('outbounds.upload')}</span>
            <data value={rate.up}>{formatRate(rate.up)}</data>
          </p>
          <div aria-hidden='true' className='hidden h-1 overflow-hidden rounded-full bg-meter-track lg:flex'>
            <span className='bg-series-down' style={{ flexGrow: rate.down }} />
            <span className='bg-series-up' style={{ flexGrow: rate.up }} />
          </div>
          <RouteOriginBadge origin={ROUTE_ORIGIN.Computed} />
        </>
      )}
      {rate?.kind === 'combined' && (
        <>
          <p className='font-mono tabular-nums'>{formatRate(rate.rate)}</p>
          <p className='text-muted-foreground'>{t('outbounds.combinedRate')}</p>
          {rate.origin === ROUTE_ORIGIN.Computed && <RouteOriginBadge origin={ROUTE_ORIGIN.Computed} />}
        </>
      )}
      {rate?.kind === 'idle' && <p className='text-muted-foreground'>{t('outbounds.noTraffic')}</p>}
      {rate === null && <p className='text-muted-foreground'>{t('outbounds.unavailable')}</p>}
    </div>
  );
}
