import { useTranslation } from 'react-i18next';

import { DELAY_TONE, LATENCY_LEVEL, toServerDelayLabel } from '@entities/Proxy';
import { ROUTE_ORIGIN, RouteOriginBadge } from '@entities/Route';
import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { OutboundLatency } from '../model/Overview.outbounds';
import { OverviewOutboundLatencyMeter } from './OverviewOutboundLatencyMeter';

export function OverviewOutboundLatency({
  latency,
  applicable,
  available,
  testing,
  busy,
  onTest,
}: {
  latency: OutboundLatency | null;
  applicable: boolean;
  available: boolean;
  testing: boolean;
  busy: boolean;
  onTest: (server: string) => Promise<void>;
}) {
  const { t } = useTranslation(OVERVIEW_NS);
  const delay = latency?.reading.meter.delay ?? null;
  const level = latency?.reading.level;
  const measured = available && delay !== null && level !== LATENCY_LEVEL.NoAnswer;

  return (
    <div role='cell' className='min-w-0 space-y-1 text-xs'>
      <p className='text-muted-foreground lg:sr-only'>{t('outbounds.delay')}</p>
      {latency === null ? (
        <span className='text-muted-foreground'>
          {applicable ? t('outbounds.unavailable') : <span aria-hidden>—</span>}
        </span>
      ) : (
        <>
          <p
            className={cn(
              'font-medium tabular-nums',
              measured && 'font-mono text-sm',
              level !== LATENCY_LEVEL.WithinNorm && DELAY_TONE[latency.reading.meter.delayState]
            )}
          >
            {latency.reading.level === LATENCY_LEVEL.NoAnswer
              ? t('outbounds.noAnswer')
              : toServerDelayLabel(t, latency.latency, available)}
          </p>
          {latency.reading.usual !== null && (
            <>
              {measured && <OverviewOutboundLatencyMeter delay={delay} usual={latency.reading.usual} />}
              <div className='flex flex-wrap items-baseline gap-1 text-muted-foreground'>
                <span>{t('outbounds.usually', { value: latency.reading.usual })}</span>
                {latency.automatedNorm && <RouteOriginBadge origin={ROUTE_ORIGIN.Computed} />}
              </div>
            </>
          )}
          {available && (
            <Button
              variant='ghost'
              size='xs'
              aria-label={t('outbounds.testServer', { name: latency.server.label ?? latency.server.tag })}
              aria-disabled={busy}
              aria-busy={testing}
              className='-ms-2.5 aria-disabled:opacity-50'
              onClick={() => {
                if (!busy) void onTest(latency.server.tag);
              }}
            >
              {t(testing ? 'delay.testing' : 'delay.test', { ns: SHARED_NS })}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
