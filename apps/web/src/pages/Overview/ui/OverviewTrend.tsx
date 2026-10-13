import { useTranslation } from 'react-i18next';

import { formatAge } from '@shared/lib/format';
import { DaemonSparkline } from '@widgets/Daemon/DaemonTraffic';

/** A series cannot be drawn from a single point. */
const MIN_POINTS = 2;

/**
 * How many times the top of the scale is raised from the first value when there is no explicit capacity.
 * Doubling from the start reads at once: a series that reached the top has doubled.
 */
const START_HEADROOM = 2;

/**
 * A reading's history across the full tile width and a caption under it: which window, in
 * what range and where the top of the scale is. The top is set in advance — by the quantity's capacity or
 * by the doubled first value — not by the series peak: otherwise any series would reach
 * the top edge, and a flat line there would read as "at the limit".
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
  /** Top of the scale is the quantity's capacity; without it, the doubled first value. */
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
