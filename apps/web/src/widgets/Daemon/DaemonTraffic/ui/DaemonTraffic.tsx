import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TRAFFIC_STEP_SECONDS, TRAFFIC_WINDOW_SECONDS, toTrafficTimes, type TrafficSample } from '@entities/Daemon';
import { BYTE_STEPS, toMirroredTicks, toTimeTicks, toValueScale } from '@shared/lib/chart';
import { formatRate } from '@shared/lib/format';
import { useReducedMotion } from '@shared/lib/media';
import { useStickyCeiling } from '@shared/lib/useStickyCeiling';
import {
  Plot,
  SkeletonRows,
  type PlotData,
  type PlotInstance,
  type PlotOptions,
  type PlotScales,
  type PlotTone,
  useFollowNow,
} from '@shared/ui';

import { FILL_ALPHA, GRID_DASH, HALF_INTERVALS, LINE_WIDTH, TIME_TICK_SECONDS, TRAFFIC_MIN_CEILING } from '../model';

/** A line cannot be drawn through a single point. */
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
        // The tick at the leftmost edge is not labelled: its label would lie
        // on the bottom tick of the speed scale.
        splits: (chart) => {
          const min = chart.scales.x.min ?? 0;

          return toTimeTicks({ min, max: chart.scales.x.max ?? 0 }, TIME_TICK_SECONDS).filter((tick) => tick > min);
        },
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
 * Traffic over a minute as two mirrored areas: incoming up from the axis,
 * outgoing down. The scale is shared between the halves: with one for each, visually equal
 * areas would differ several times over, and directions could not be compared
 * by the picture.
 *
 * Time is always a minute up to "now". The scale is from the peak of that minute, not below
 * `TRAFFIC_MIN_CEILING`: the peak over the whole daemon uptime would keep an ordinary minute
 * pressed to zero. The scale grows at once and shrinks only when the peak fell
 * fourfold (`useStickyCeiling`) — otherwise it would rebuild every time
 * a burst leaves past the left edge.
 */
export function DaemonTraffic({
  samples,
  sampledAt,
  peakDown,
  peakUp,
}: {
  samples: TrafficSample[];
  /** When the last point arrived, epoch milliseconds; `null` means no points yet. */
  sampledAt: number | null;
  peakDown: number;
  peakUp: number;
}) {
  const { t } = useTranslation('widgets/Daemon/DaemonTraffic');
  const reducedMotion = useReducedMotion();
  const [chart, setChart] = useState<PlotInstance | null>(null);
  const options = useMemo(() => buildOptions(t), [t]);
  // The page also renders on the stream freshness tick, not only on a new frame:
  // without memoization the chart would rebuild paths on every such render.
  const times = useMemo(
    () => (sampledAt === null ? [] : toTrafficTimes(samples.length, sampledAt)),
    [samples.length, sampledAt]
  );
  const data = useMemo<PlotData>(
    () => [times, samples.map((sample) => sample.down), samples.map((sample) => -sample.up)],
    [times, samples]
  );
  const ceiling = useStickyCeiling(
    toValueScale(Math.max(peakDown, peakUp, TRAFFIC_MIN_CEILING), BYTE_STEPS, HALF_INTERVALS).ceiling
  );
  const scales = useMemo<PlotScales>(() => {
    const y = { min: -ceiling, max: ceiling };

    if (!reducedMotion || times.length === 0) {
      return { y };
    }

    const last = times[times.length - 1];

    return { x: { min: last - TRAFFIC_WINDOW_SECONDS, max: last }, y };
  }, [ceiling, reducedMotion, times]);

  useFollowNow(chart, TRAFFIC_WINDOW_SECONDS, TRAFFIC_STEP_SECONDS, !reducedMotion);

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
