import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { formatAge, formatBytes, formatRate } from '@shared/lib/format';
import { CARD_FLUSH, Card } from '@shared/ui';
import { ConnectionSummaryVolume } from '@widgets/ConnectionSummary';
import { DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';

import type { OverviewRuntime } from '../lib';
import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';

const PERCENT = 100;

/** `null` — снимка устройства ещё не было; прочерк — объём за окно наблюдения нулевой. */
function toVolume(pending: boolean, bytes: number): string | null {
  if (pending) {
    return null;
  }

  return bytes > 0 ? formatBytes(bytes) : '—';
}

function toPeak(t: TFunction<'pages/Overview'>, peak: number): string {
  return peak > 0 ? t('traffic.peak', { value: formatRate(peak) }) : t('traffic.noPeak');
}

export function OverviewTraffic({ runtime }: { runtime: OverviewRuntime }) {
  const { t } = useTranslation('pages/Overview');
  const uplink = runtime.system?.uplink;
  const linkRate = runtime.uplink.rx + runtime.uplink.tx;
  // Инкапсуляция прокси добавляет байт поверх исходного трафика, поэтому доля
  // упирается в сотню.
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
      note={uplink === undefined ? undefined : t('traffic.note', { link: uplink.name, rate: formatRate(linkRate) })}
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
                historyPeak={runtime.historyPeak}
              />
            </div>
          </div>
        </Card>

        <ConnectionSummaryVolume totals={runtime.totals} />
      </div>
    </OverviewSection>
  );
}
