import { useTranslation } from 'react-i18next';

import { formatAge, formatRate } from '@shared/lib/format';
import { CARD_FLUSH, Card } from '@shared/ui';
import { ConnectionSummaryVolume } from '@widgets/ConnectionSummary';
import { DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';

import type { OverviewRuntime } from '../lib';
import { toVolume, toPeak } from '../lib/Overview.traffic';
import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';

const PERCENT = 100;

export function OverviewTraffic({ runtime }: { runtime: OverviewRuntime }) {
  const { t } = useTranslation('pages/Overview');
  const uplink = runtime.system?.uplink;
  // Proxy encapsulation adds bytes on top of the original traffic, so the share
  // hits a hundred.
  const proxyShare = Math.min(1, runtime.share.link > 0 ? runtime.share.proxy / runtime.share.link : 0);
  const noSnapshot = runtime.system === null;
  const proxyContext =
    runtime.share.link > 0
      ? t('traffic.proxyShare', { percent: Math.round(proxyShare * PERCENT) })
      : t('traffic.proxyUnknown');
  const uplinkContext =
    runtime.share.seconds > 0
      ? t('traffic.uplinkSince', { age: formatAge(runtime.share.seconds) })
      : t('device.waiting');

  return (
    <OverviewSection
      title={t('traffic.title')}
      // The channel is the interface counters between device snapshots once every two
      // seconds, the tiles below are sing-box's own traffic per second. These are different
      // quantities: part of the channel bypasses sing-box.
      note={
        uplink === undefined
          ? undefined
          : t('traffic.note', {
              link: uplink.name,
              down: formatRate(runtime.uplink.rx),
              up: formatRate(runtime.uplink.tx),
            })
      }
    >
      <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]'>
        <Card className={CARD_FLUSH}>
          <div className='flex flex-col xl:flex-row'>
            <ul aria-label={t('traffic.label')} className='grid min-w-0 grow grid-cols-2 gap-px bg-border'>
              <OverviewTile
                label={t('traffic.proxy')}
                value={toVolume(noSnapshot, runtime.share.proxy)}
                context={noSnapshot ? null : proxyContext}
                meter={runtime.share.link > 0 ? proxyShare : undefined}
              />
              <OverviewTile
                label={t('traffic.uplink')}
                value={toVolume(noSnapshot, runtime.share.link)}
                context={noSnapshot ? null : uplinkContext}
              />
              <OverviewTile
                label={t('traffic.down')}
                value={runtime.awaiting ? null : formatRate(runtime.now.down)}
                tone='text-series-down'
                context={runtime.awaiting ? null : toPeak(t, runtime.peakDown)}
              />
              <OverviewTile
                label={t('traffic.up')}
                value={runtime.awaiting ? null : formatRate(runtime.now.up)}
                tone='text-series-up'
                context={runtime.awaiting ? null : toPeak(t, runtime.peakUp)}
              />
            </ul>

            <div className='min-w-0 border-t border-border px-4 py-4 xl:w-1/2 xl:border-t-0 xl:border-l'>
              <DaemonTraffic
                samples={runtime.traffic}
                sampledAt={runtime.trafficAt}
                peakDown={runtime.peakDown}
                peakUp={runtime.peakUp}
              />
            </div>
          </div>
        </Card>

        <ConnectionSummaryVolume totals={runtime.totals} />
      </div>
    </OverviewSection>
  );
}
