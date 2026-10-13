import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HISTORY_STEP_SECONDS, HISTORY_WINDOW_SECONDS, toHistoryTimes } from '@entities/Connection';
import { COUNT_STEPS, toTimeTicks, toValueScale } from '@shared/lib/chart';
import { useReducedMotion } from '@shared/lib/media';
import { useStickyCeiling } from '@shared/lib/useStickyCeiling';
import {
  Card,
  CardContent,
  CardHeader,
  Plot,
  SECTION_LABEL,
  SkeletonRows,
  type PlotData,
  type PlotInstance,
  type PlotOptions,
  type PlotScales,
  type PlotTone,
  useFollowNow,
} from '@shared/ui';

import { FILL_ALPHA, GRID_DASH, LINE_WIDTH, TIME_TICK_SECONDS } from '../model';

/** A line cannot be drawn through a single point. */
const MIN_POINTS = 2;

function toTimeLabels(t: TFunction<'widgets/ConnectionHistory'>, splits: number[], max: number): string[] {
  return splits.map((value) => {
    const age = Math.round(max - value);

    return age === 0 ? t('chart.now', { ns: 'shared' }) : t('chart.ago', { ns: 'shared', value: age });
  });
}

const TONES: readonly PlotTone[] = [{ token: '--primary', fillAlpha: FILL_ALPHA }];

function buildOptions(t: TFunction<'widgets/ConnectionHistory'>): PlotOptions {
  return {
    scales: { x: { time: false, auto: false }, y: { auto: false } },
    series: [{}, { fillTo: 0, width: LINE_WIDTH, points: { show: false } }],
    axes: [
      {
        // The tick at the leftmost edge is not labelled: its label would lie
        // on the bottom scale tick.
        splits: (chart) => {
          const min = chart.scales.x.min ?? 0;

          return toTimeTicks({ min, max: chart.scales.x.max ?? 0 }, TIME_TICK_SECONDS).filter((tick) => tick > min);
        },
        values: (chart, splits) => toTimeLabels(t, splits, chart.scales.x.max ?? 0),
      },
      {
        splits: (chart) => toValueScale(chart.scales.y.max ?? 0, COUNT_STEPS).ticks,
        values: (_, splits) => splits.map(String),
        grid: { show: true, dash: GRID_DASH },
      },
    ],
  };
}

/**
 * Open connections over a minute. The live buffer is accumulated by the panel, and it opens with
 * the minute the daemon holds: the runtime returns only a snapshot of live ones.
 *
 * The time axis is arranged like the traffic chart: point time is computed by the model
 * (`toHistoryTimes`), the window is always a minute up to "now", and an incomplete buffer
 * leaves the left part empty instead of stretching across the whole axis. The scale edge
 * is round with headroom for fluctuations (`useStickyCeiling`): the connection count wanders
 * every second, and an edge by the peak would change axis labels on every frame.
 */
export function ConnectionHistory({
  samples,
  sampledAt,
  peak,
}: {
  samples: number[];
  /** When the last point arrived, epoch milliseconds; `null` means no points yet. */
  sampledAt: number | null;
  /** Peak of the visible minute. */
  peak: number;
}) {
  const { t } = useTranslation('widgets/ConnectionHistory');
  const reducedMotion = useReducedMotion();
  const [chart, setChart] = useState<PlotInstance | null>(null);
  const options = useMemo(() => buildOptions(t), [t]);
  const times = useMemo(
    () => (sampledAt === null ? [] : toHistoryTimes(samples.length, sampledAt)),
    [samples.length, sampledAt]
  );
  const data = useMemo<PlotData>(() => [times, samples], [times, samples]);
  const ceiling = useStickyCeiling(toValueScale(peak, COUNT_STEPS).ceiling);
  const scales = useMemo<PlotScales>(() => {
    const y = { min: 0, max: ceiling };

    if (!reducedMotion || times.length === 0) {
      return { y };
    }

    const last = times[times.length - 1];

    return { x: { min: last - HISTORY_WINDOW_SECONDS, max: last }, y };
  }, [ceiling, reducedMotion, times]);

  useFollowNow(chart, HISTORY_WINDOW_SECONDS, HISTORY_STEP_SECONDS, !reducedMotion);

  return (
    <Card className='gap-3'>
      <CardHeader>
        <h3 className={SECTION_LABEL}>{t('title')}</h3>
      </CardHeader>

      <CardContent>
        {sampledAt === null || samples.length < MIN_POINTS ? (
          <SkeletonRows rows={1} rowClassName='h-36' className='p-0' />
        ) : (
          <Plot
            options={options}
            tones={TONES}
            data={data}
            scales={scales}
            onChart={setChart}
            label={t('chart', { peak: t('count.connection', { ns: 'shared', count: peak }) })}
            className='h-36'
          />
        )}
      </CardContent>
    </Card>
  );
}
