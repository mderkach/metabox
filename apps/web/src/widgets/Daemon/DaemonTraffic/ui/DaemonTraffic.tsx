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
        // Деление на самой левой кромке не подписывается: его подпись легла бы
        // на нижнее деление шкалы скорости.
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
 * Трафик за минуту двумя зеркальными областями: входящий вверх от оси,
 * исходящий вниз. Шкала у половин общая: по своей на каждую равные на вид
 * области отличались бы в разы, и сравнить направления по картинке было бы
 * нельзя.
 *
 * Время — всегда минута до «сейчас». Шкала — от пика этой минуты, не ниже
 * `TRAFFIC_MIN_CEILING`: пик за всю работу демона держал бы обычную минуту
 * прижатой к нулю. Растёт шкала сразу, а сжимается, только когда пик упал
 * вчетверо (`useStickyCeiling`), — иначе она перестраивалась бы каждый раз,
 * когда всплеск уходит за левую кромку.
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
