import { useTranslation } from 'react-i18next';

import { useTrafficHistory, type SystemStat } from '@entities/Daemon';
import { formatAge, formatBytes } from '@shared/lib/format';
import { CARD_FLUSH, Card } from '@shared/ui';
import { DaemonSparkline } from '@widgets/Daemon/DaemonTraffic';

import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';

const DEGREE_PRECISION = 1;
/** Загрузка печатается сотыми: десятых мало, чтобы отличить простой от работы. */
const LOAD_PRECISION = 2;

export function OverviewDevice({ system }: { system: SystemStat | null }) {
  const { t } = useTranslation('pages/Overview');
  const history = useTrafficHistory();
  const deviceHistory = history.data?.device ?? [];
  // Зон у платы может не быть вовсе, поэтому берётся первая из отсортированных
  // только на непустом списке.
  const zones = system === null ? [] : system.thermal.toSorted((left, right) => right.celsius - left.celsius);
  const hottest = zones.length > 0 ? zones[0] : undefined;
  const usedMemory = system === null ? 0 : system.memory.total - system.memory.available;

  return (
    <OverviewSection title={t('device.title')}>
      <Card className={CARD_FLUSH}>
        <ul aria-label={t('device.label')} className='grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4'>
          <OverviewTile
            label={t('device.load')}
            value={system === null ? '—' : system.load.one.toFixed(LOAD_PRECISION)}
            context={
              system === null
                ? t('device.waiting')
                : t('device.ofCores', { cores: t('count.core', { ns: 'shared', count: system.load.cores }) })
            }
            chart={
              <DaemonSparkline samples={deviceHistory.map((point) => point.load)} label={t('device.loadHistory')} />
            }
          />
          <OverviewTile
            label={t('device.temperature')}
            value={hottest === undefined ? '—' : `${hottest.celsius.toFixed(DEGREE_PRECISION)} °C`}
            context={hottest === undefined ? t('device.noZones') : hottest.name}
            chart={
              <DaemonSparkline
                samples={deviceHistory.map((point) => point.celsius)}
                label={t('device.temperatureHistory')}
                tone='text-signal-warn'
              />
            }
          />
          <OverviewTile
            label={t('device.memory')}
            value={system === null ? '—' : formatBytes(usedMemory)}
            context={
              system === null ? t('device.waiting') : t('device.ofTotal', { total: formatBytes(system.memory.total) })
            }
            chart={
              <DaemonSparkline samples={deviceHistory.map((point) => point.memory)} label={t('device.memoryHistory')} />
            }
          />
          <OverviewTile
            label={t('device.uptime')}
            value={system === null ? '—' : formatAge(system.uptime)}
            context={system === null ? t('device.waiting') : t('device.sinceBoot')}
          />
        </ul>
      </Card>
    </OverviewSection>
  );
}
