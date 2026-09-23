import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TRAFFIC_WINDOW_SECONDS, toTrafficTimes, type TrafficSample } from '@entities/Daemon';
import { BYTE_STEPS, toMirroredTicks, toTimeTicks, toTimeWindow, toValueScale } from '@shared/lib/chart';
import { formatRate } from '@shared/lib/format';
import { useReducedMotion } from '@shared/lib/media';
import {
  Plot,
  SkeletonRows,
  type PlotData,
  type PlotInstance,
  type PlotOptions,
  type PlotScales,
  type PlotTone,
} from '@shared/ui';

import { useFollowNow } from '../lib';
import { FILL_ALPHA, GRID_DASH, HALF_INTERVALS, LINE_WIDTH, TIME_TICK_SECONDS } from '../model';

/** По одной точке линию не проведёшь. */
const MIN_POINTS = 2;

function toTimeLabels(t: TFunction<'widgets/Daemon/DaemonTraffic'>, splits: number[], max: number): string[] {
  return splits.map((value) => {
    const age = Math.round(max - value);

    return age === 0 ? t('chart.now', { ns: 'shared' }) : t('chart.ago', { ns: 'shared', value: age });
  });
}

const SERIES = { fillTo: 0, width: LINE_WIDTH, points: { show: false } };

const TONES: readonly PlotTone[] = [
  { token: '--series-down', fillAlpha: FILL_ALPHA },
  { token: '--series-up', fillAlpha: FILL_ALPHA },
];

function buildOptions(t: TFunction<'widgets/Daemon/DaemonTraffic'>): PlotOptions {
  return {
    scales: { x: { time: false, auto: false }, y: { auto: false } },
    series: [{}, SERIES, SERIES],
    axes: [
      {
        splits: (chart) =>
          toTimeTicks({ min: chart.scales.x.min ?? 0, max: chart.scales.x.max ?? 0 }, TIME_TICK_SECONDS),
        values: (chart, splits) => toTimeLabels(t, splits, chart.scales.x.max ?? 0),
      },
      {
        splits: (chart) => toMirroredTicks(toValueScale(chart.scales.y.max ?? 0, BYTE_STEPS, HALF_INTERVALS).ticks),
        values: (_, splits) => splits.map((value) => formatRate(Math.abs(value))),
        grid: { show: true, dash: GRID_DASH },
      },
    ],
  };
}

/**
 * Трафик за минуту двумя зеркальными областями: входящий вверх от оси,
 * исходящий вниз. Шкала у половин общая: по своей на каждую равные на вид
 * области отличались бы в разы, и сравнить направления по картинке было бы
 * нельзя.
 */
export function DaemonTraffic({
  samples,
  sampledAt,
  peakDown,
  peakUp,
}: {
  samples: TrafficSample[];
  /** Когда пришла последняя точка, миллисекунды эпохи; `null` — точек ещё не было. */
  sampledAt: number | null;
  peakDown: number;
  peakUp: number;
}) {
  const { t } = useTranslation('widgets/Daemon/DaemonTraffic');
  const reducedMotion = useReducedMotion();
  const [chart, setChart] = useState<PlotInstance | null>(null);
  const options = useMemo(() => buildOptions(t), [t]);
  // Страница рендерится и по тику свежести потока, а не только по новому кадру:
  // без мемоизации график перестраивал бы пути на каждый такой рендер.
  const times = useMemo(
    () => (sampledAt === null ? [] : toTrafficTimes(samples.length, sampledAt)),
    [samples.length, sampledAt]
  );
  const data = useMemo<PlotData>(
    () => [times, samples.map((sample) => sample.down), samples.map((sample) => -sample.up)],
    [times, samples]
  );
  const ceiling = toValueScale(Math.max(peakDown, peakUp), BYTE_STEPS, HALF_INTERVALS).ceiling;
  const scales = useMemo<PlotScales>(() => {
    const y = { min: -ceiling, max: ceiling };

    if (!reducedMotion || times.length === 0) {
      return { y };
    }

    return { x: toTimeWindow(times[0], times[times.length - 1], TRAFFIC_WINDOW_SECONDS), y };
  }, [ceiling, reducedMotion, times]);

  useFollowNow(chart, TRAFFIC_WINDOW_SECONDS, !reducedMotion);

  if (sampledAt === null || samples.length < MIN_POINTS) {
    return <SkeletonRows rows={1} rowClassName='h-44' className='p-0' />;
  }

  return (
    <Plot
      options={options}
      tones={TONES}
      data={data}
      scales={scales}
      onChart={setChart}
      label={t('chart.label', { window: t('window.minute'), down: formatRate(peakDown), up: formatRate(peakUp) })}
      className='h-44'
    />
  );
}
