import { useTranslation } from 'react-i18next';

import { formatAge } from '@shared/lib/format';
import { DaemonSparkline } from '@widgets/Daemon/DaemonTraffic';

/** По одной точке ряд не нарисуешь. */
const MIN_POINTS = 2;

/**
 * Во сколько раз от первого значения поднят верх шкалы без явной ёмкости.
 * Удвоение от старта читается сразу: ряд, дошедший до верха, вырос вдвое.
 */
const START_HEADROOM = 2;

/**
 * История показания во всю ширину плитки и подпись под ней: за какое окно, в
 * каком размахе и где верх шкалы. Верх задан заранее — ёмкостью величины или
 * удвоенным первым значением, — а не пиком ряда: иначе любой ряд доставал бы
 * до верхней кромки, и ровная линия там читалась бы как «на пределе».
 */
export function OverviewTrend({
  samples,
  stepSeconds,
  capacity,
  format,
  label,
  tone,
}: {
  samples: number[];
  stepSeconds: number;
  /** Верх шкалы — ёмкость величины; без неё — удвоенное первое значение. */
  capacity?: number;
  format: (value: number) => string;
  label: string;
  tone?: string;
}) {
  const { t } = useTranslation('pages/Overview');

  if (samples.length < MIN_POINTS) {
    return null;
  }

  const ceiling = Math.max(capacity ?? samples[0] * START_HEADROOM, ...samples);

  return (
    <div className='mt-1 flex flex-col gap-1'>
      <DaemonSparkline samples={samples} capacity={ceiling} label={label} tone={tone} className='h-8 w-full' />
      <p className='text-xs text-muted-foreground tabular-nums'>
        {t('device.trend', {
          window: formatAge(samples.length * stepSeconds),
          from: format(Math.min(...samples)),
          to: format(Math.max(...samples)),
        })}
      </p>
    </div>
  );
}
