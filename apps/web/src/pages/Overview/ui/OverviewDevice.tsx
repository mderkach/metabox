import { useTranslation } from 'react-i18next';

import { useTrafficHistory, type SystemStat } from '@entities/Daemon';
import { formatAge, formatBytes } from '@shared/lib/format';
import { CARD_FLUSH, Card } from '@shared/ui';

import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';
import { OverviewTrend } from './OverviewTrend';

const DEGREE_PRECISION = 1;
/** Load is printed in hundredths: tenths are too coarse to tell idle from work. */
const LOAD_PRECISION = 2;

/**
 * Top of the temperature scale. The daemon does not give throttle points, and for router SoCs
 * they lie around 85–105 °C: a hundred shows the headroom to overheating, not
 * a fluctuation around forty degrees at full height.
 */
const TEMPERATURE_CAPACITY = 100;

function formatLoad(value: number): string {
  return value.toFixed(LOAD_PRECISION);
}

function formatCelsius(value: number): string {
  return `${value.toFixed(DEGREE_PRECISION)} °C`;
}

/** Dash means the board has no thermal zones; `null` means there was no snapshot yet. */
function toTemperature(system: SystemStat | null, hottest: SystemStat['thermal'][number] | undefined): string | null {
  if (system === null) {
    return null;
  }

  return hottest === undefined ? '—' : formatCelsius(hottest.celsius);
}

export function OverviewDevice({ system, collapsible }: { system: SystemStat | null; collapsible: boolean }) {
  const { t } = useTranslation('pages/Overview');
  const history = useTrafficHistory();
  const deviceHistory = history.data?.device ?? [];
  const stepSeconds = history.data?.deviceStepSeconds ?? 0;
  // A board may have no zones at all, so the first of the sorted ones is taken
  // only on a non-empty list.
  const zones = system === null ? [] : system.thermal.toSorted((left, right) => right.celsius - left.celsius);
  const hottest = zones.length > 0 ? zones[0] : undefined;
  const usedMemory = system === null ? 0 : system.memory.total - system.memory.available;

  return (
    <OverviewSection title={t('device.title')} collapsible={collapsible}>
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
