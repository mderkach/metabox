import { useTranslation } from 'react-i18next';

import { formatAge, formatBytes, formatRate } from '@shared/lib/format';
import { Card } from '@shared/ui';
import { ConnectionSummaryVolume } from '@widgets/ConnectionSummary';
import { DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';

import type { OverviewRuntime } from '../lib';
import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';

const PERCENT = 100;

export function OverviewTraffic({ runtime }: { runtime: OverviewRuntime }) {
  const { t } = useTranslation('pages/Overview');
  const uplink = runtime.system?.uplink;
  const linkRate = runtime.uplink.rx + runtime.uplink.tx;
  // Инкапсуляция прокси добавляет байт поверх исходного трафика, поэтому доля
  // упирается в сотню.
  const proxyShare = Math.min(1, runtime.share.link > 0 ? runtime.share.proxy / runtime.share.link : 0);

  return (
    <OverviewSection
      title={t('traffic.title')}
      note={uplink === undefined ? undefined : t('traffic.note', { link: uplink.name, rate: formatRate(linkRate) })}
    >
      <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]'>
        <Card className='gap-0 py-0'>
          <div className='flex flex-col xl:flex-row'>
            <ul
              aria-label={t('traffic.label')}
              className='grid min-w-0 grow grid-cols-1 gap-px bg-border sm:grid-cols-2'
            >
              <OverviewTile
                label={t('traffic.proxy')}
                value={runtime.share.proxy > 0 ? formatBytes(runtime.share.proxy) : '—'}
                context={
                  runtime.share.link > 0
                    ? t('traffic.proxyShare', { percent: Math.round(proxyShare * PERCENT) })
                    : t('traffic.proxyUnknown')
                }
                meter={runtime.share.link > 0 ? proxyShare : undefined}
              />
              <OverviewTile
                label={t('traffic.uplink')}
                value={runtime.share.link > 0 ? formatBytes(runtime.share.link) : '—'}
                context={
                  runtime.share.seconds > 0
                    ? t('traffic.uplinkSince', { age: formatAge(runtime.share.seconds) })
                    : t('device.waiting')
                }
              />
              <OverviewTile
                label={t('traffic.down')}
                value={formatRate(runtime.now.down)}
                tone='text-series-down'
                context={
                  runtime.peakDown > 0
                    ? t('traffic.peak', { value: formatRate(runtime.peakDown) })
                    : t('traffic.noPeak')
                }
              />
              <OverviewTile
                label={t('traffic.up')}
                value={formatRate(runtime.now.up)}
                tone='text-series-up'
                context={
                  runtime.peakUp > 0 ? t('traffic.peak', { value: formatRate(runtime.peakUp) }) : t('traffic.noPeak')
                }
              />
            </ul>

            <div className='min-w-0 border-t border-border px-4 py-4 xl:w-1/2 xl:border-t-0 xl:border-l'>
              <DaemonTraffic samples={runtime.traffic} />
            </div>
          </div>
        </Card>

        <ConnectionSummaryVolume totals={runtime.totals} />
      </div>
    </OverviewSection>
  );
}
