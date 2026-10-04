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

/** По одной точке линию не проведёшь. */
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
        // Деление на самой левой кромке не подписывается: его подпись легла бы
        // на нижнее деление шкалы.
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
 * Открытые соединения за минуту. Живой буфер копит панель, а открывается он
 * минутой, которую держит демон: рантайм отдаёт только снимок живых.
 *
 * Ось времени устроена как у графика трафика: время точек считает модель
 * (`toHistoryTimes`), окно — всегда минута до «сейчас», и неполный буфер
 * оставляет левую часть пустой, а не растягивается на всю ось. Кромка шкалы
 * круглая с запасом на колебания (`useStickyCeiling`): число соединений гуляет
 * каждую секунду, и кромка по пику меняла бы подписи оси на каждом кадре.
 */
export function ConnectionHistory({
  samples,
  sampledAt,
  peak,
}: {
  samples: number[];
  /** Когда пришла последняя точка, миллисекунды эпохи; `null` — точек ещё не было. */
  sampledAt: number | null;
  /** Пик видимой минуты. */
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
