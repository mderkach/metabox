import { Trans, useTranslation } from 'react-i18next';

import { formatAge, formatRate } from '@shared/lib/format';
import { SECONDS_IN_MINUTE } from '@shared/lib/time';
import { cn } from '@shared/lib/utils';
import { CARD_FLUSH, Card } from '@shared/ui';
import { ConnectionSummaryVolume } from '@widgets/ConnectionSummary';
import { DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { OverviewRuntime } from '../lib';
import { toRate, toRateContext } from './Overview.trafficText';
import { OverviewCoreGap } from './OverviewCoreGap';
import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';
import { OverviewTrafficHelp } from './OverviewTrafficHelp';
import { OverviewTrafficShares } from './OverviewTrafficShares';

export function OverviewTraffic({ runtime }: { runtime: OverviewRuntime }) {
  const { t } = useTranslation(OVERVIEW_NS);
  const uplink = runtime.system?.uplink;
  const seconds = runtime.system?.share.seconds;
  const period =
    seconds !== undefined && seconds >= SECONDS_IN_MINUTE
      ? t('traffic.uplinkSince', { age: formatAge(seconds) })
      : t('traffic.collecting');
  const showHistory = runtime.stopped && runtime.trafficAt !== null;

  return (
    <OverviewSection
      title={t('traffic.title')}
      note={
        runtime.system !== null && (
          <div className='flex flex-wrap items-baseline gap-x-2'>
            <span>{period}</span>
            {uplink !== undefined && (
              <span className='inline-flex min-w-0 items-center gap-1'>
                <span className='min-w-0 wrap-anywhere'>
                  <Trans
                    t={t}
                    i18nKey='traffic.internetConnection'
                    values={{ name: uplink.name }}
                    components={{ iface: <bdi className='font-mono' /> }}
                  />
                </span>
                <OverviewTrafficHelp label={t('traffic.internetHelpLabel')}>
                  {t('traffic.internetHelp')}
                </OverviewTrafficHelp>
              </span>
            )}
          </div>
        )
      }
    >
      <OverviewTrafficShares system={runtime.system} stopped={runtime.stopped} />
      {uplink !== undefined && (
        <p className='text-sm wrap-anywhere text-muted-foreground'>
          {t('traffic.note', {
            link: uplink.name,
            down: formatRate(runtime.uplink.rx),
            up: formatRate(runtime.uplink.tx),
          })}
        </p>
      )}
      <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]'>
        <Card className={cn(CARD_FLUSH, '@container')}>
          <div className='flex flex-col xl:flex-row'>
            <ul aria-label={t('traffic.label')} className='grid min-w-0 grow gap-px bg-border @3xs:grid-cols-2'>
              <OverviewTile
                label={t('traffic.down')}
                value={toRate(runtime.awaiting, runtime.now.down)}
                absent={runtime.coreGap !== null}
                tone={runtime.coreGap === null ? 'text-series-down' : undefined}
                context={toRateContext(t, runtime.awaiting, runtime.coreGap, runtime.peakDown)}
              />
              <OverviewTile
                label={t('traffic.up')}
                value={toRate(runtime.awaiting, runtime.now.up)}
                absent={runtime.coreGap !== null}
                tone={runtime.coreGap === null ? 'text-series-up' : undefined}
                context={toRateContext(t, runtime.awaiting, runtime.coreGap, runtime.peakUp)}
              />
            </ul>

            <div className='min-w-0 border-t border-border px-4 py-4 xl:w-1/2 xl:border-t-0 xl:border-l'>
              {!showHistory && runtime.coreGap !== null ? (
                <OverviewCoreGap gap={runtime.coreGap} />
              ) : (
                <DaemonTraffic
                  samples={runtime.traffic}
                  sampledAt={runtime.trafficAt}
                  peakDown={runtime.peakDown}
                  peakUp={runtime.peakUp}
                  historical={showHistory}
                />
              )}
            </div>
          </div>
        </Card>

        <ConnectionSummaryVolume
          totals={runtime.totals}
          placeholder={
            runtime.connectionsGap !== null || runtime.connectionsAwaiting ? (
              <OverviewCoreGap gap={runtime.connectionsGap} />
            ) : undefined
          }
        />
      </div>
    </OverviewSection>
  );
}
