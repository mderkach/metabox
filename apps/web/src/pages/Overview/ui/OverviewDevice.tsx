import { useTranslation } from 'react-i18next';

import { useTrafficHistory, type SystemStat } from '@entities/Daemon';
import { formatAge, formatBytes } from '@shared/lib/format';
import { CARD_FLUSH, Card } from '@shared/ui';

import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';
import { OverviewTrend } from './OverviewTrend';

const DEGREE_PRECISION = 1;
/** Загрузка печатается сотыми: десятых мало, чтобы отличить простой от работы. */
const LOAD_PRECISION = 2;

/**
 * Верх шкалы температуры. Точки троттлинга демон не отдаёт, а у SoC роутеров
 * она лежит в районе 85–105 °C: сотня показывает запас до перегрева, а не
 * колебание вокруг сорока градусов во всю высоту.
 */
const TEMPERATURE_CAPACITY = 100;

function formatLoad(value: number): string {
  return value.toFixed(LOAD_PRECISION);
}

function formatCelsius(value: number): string {
  return `${value.toFixed(DEGREE_PRECISION)} °C`;
}

/** Прочерк — у платы нет термозон; `null` — снимка ещё не было. */
function toTemperature(system: SystemStat | null, hottest: SystemStat['thermal'][number] | undefined): string | null {
  if (system === null) {
    return null;
  }

  return hottest === undefined ? '—' : formatCelsius(hottest.celsius);
}

export function OverviewDevice({ system }: { system: SystemStat | null }) {
  const { t } = useTranslation('pages/Overview');
  const history = useTrafficHistory();
  const deviceHistory = history.data?.device ?? [];
  const stepSeconds = history.data?.stepSeconds ?? 0;
  // Зон у платы может не быть вовсе, поэтому берётся первая из отсортированных
  // только на непустом списке.
  const zones = system === null ? [] : system.thermal.toSorted((left, right) => right.celsius - left.celsius);
  const hottest = zones.length > 0 ? zones[0] : undefined;
  const usedMemory = system === null ? 0 : system.memory.total - system.memory.available;

  return (
    <OverviewSection title={t('device.title')}>
      <Card className={CARD_FLUSH}>
        <ul aria-label={t('device.label')} className='grid grid-cols-2 gap-px bg-border lg:grid-cols-4'>
          <OverviewTile
            label={t('device.load')}
            value={system === null ? null : formatLoad(system.load.one)}
            context={
              system === null
                ? null
                : t('device.ofCores', { cores: t('count.core', { ns: 'shared', count: system.load.cores }) })
            }
            chart={
              <OverviewTrend
                samples={deviceHistory.map((point) => point.load)}
                stepSeconds={stepSeconds}
                capacity={system?.load.cores}
                format={formatLoad}
                label={t('device.loadHistory')}
              />
            }
          />
          <OverviewTile
            label={t('device.temperature')}
            value={toTemperature(system, hottest)}
            context={system === null ? null : (hottest?.name ?? t('device.noZones'))}
            chart={
              <OverviewTrend
                samples={deviceHistory.map((point) => point.celsius)}
                stepSeconds={stepSeconds}
                capacity={TEMPERATURE_CAPACITY}
                format={formatCelsius}
                label={t('device.temperatureHistory')}
                tone='text-signal-warn'
              />
            }
          />
          <OverviewTile
            label={t('device.memory')}
            value={system === null ? null : formatBytes(usedMemory)}
            context={system === null ? null : t('device.ofTotal', { total: formatBytes(system.memory.total) })}
            chart={
              <OverviewTrend
                samples={deviceHistory.map((point) => point.memory)}
                stepSeconds={stepSeconds}
                capacity={system?.memory.total}
                format={formatBytes}
                label={t('device.memoryHistory')}
              />
            }
          />
          <OverviewTile
            label={t('stat.uptime', { ns: 'shared' })}
            value={system === null ? null : formatAge(system.uptime)}
            context={system === null ? null : t('device.sinceBoot')}
          />
        </ul>
      </Card>
    </OverviewSection>
  );
}
