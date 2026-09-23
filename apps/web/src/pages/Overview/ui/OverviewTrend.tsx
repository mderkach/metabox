import { useTranslation } from 'react-i18next';

import { formatAge } from '@shared/lib/format';
import { DaemonSparkline } from '@widgets/Daemon/DaemonTraffic';

/** По одной точке ряд не нарисуешь. */
const MIN_POINTS = 2;

/**
 * История показания во всю ширину плитки и подпись под ней: за какое окно и в
 * каком размахе. Без подписи ровная линия не отличима от «на пределе», а
 * окно в шесть часов — от минуты.
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
  /** Верх шкалы: ёмкость величины, а не пик ряда. */
  capacity?: number;
  format: (value: number) => string;
  label: string;
  tone?: string;
}) {
  const { t } = useTranslation('pages/Overview');

  if (samples.length < MIN_POINTS) {
    return null;
  }

  return (
    <div className='mt-1 flex flex-col gap-1'>
      <DaemonSparkline samples={samples} capacity={capacity} label={label} tone={tone} className='h-8 w-full' />
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
