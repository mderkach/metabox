import type { TFunction } from 'i18next';

import { BYTE_STEPS, toMirroredTicks, toTimeTicks, toValueScale } from '@shared/lib/chart';
import { formatRate } from '@shared/lib/format';
import { type PlotOptions } from '@shared/ui';

import { GRID_DASH, HALF_INTERVALS, LINE_WIDTH, TIME_TICK_SECONDS } from '../model';

function toTimeLabels(t: TFunction<'widgets/Daemon/DaemonTraffic'>, splits: number[], max: number): string[] {
  return splits.map((value) => {
    const age = Math.round(max - value);

    return age === 0 ? t('chart.now', { ns: 'shared' }) : t('chart.ago', { ns: 'shared', value: age });
  });
}

function toRateLabel(t: TFunction<'widgets/Daemon/DaemonTraffic'>, value: number): string {
  if (value === 0) {
    return formatRate(0);
  }

  return t(value > 0 ? 'axis.down' : 'axis.up', { value: formatRate(Math.abs(value)) });
}

const SERIES = { fillTo: 0, width: LINE_WIDTH, points: { show: false } };

export function buildOptions(t: TFunction<'widgets/Daemon/DaemonTraffic'>): PlotOptions {
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
        // The lower half is mirrored: without a direction mark its labels repeat the upper ones.
        values: (_, splits) => splits.map((value) => toRateLabel(t, value)),
        grid: { show: true, dash: GRID_DASH },
      },
    ],
  };
}
