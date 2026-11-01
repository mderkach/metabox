import { useTranslation } from 'react-i18next';

import { HISTORY_STEP_SECONDS, HISTORY_WINDOW_POINTS } from '@entities/Connection';
import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Skeleton } from '@shared/ui';
import { ConnectionSummaryPanel } from '@widgets/ConnectionSummary';

import type { OverviewRuntime } from '../lib';
import { OverviewTrend } from './OverviewTrend';

/**
 * Open connections as a number with its minute under it. Closed ones are counted
 * by the tab: the source returns only live ones, so zero right after opening is
 * not a failure but the start of the count.
 */
export function OverviewActivity({ runtime }: { runtime: OverviewRuntime }) {
  const { t } = useTranslation('pages/Overview');
  const minute = runtime.history.slice(-HISTORY_WINDOW_POINTS);

  return (
    <ConnectionSummaryPanel title={t('connections.title')} href='/connections'>
      <div className='flex flex-col gap-1'>
        {runtime.connectionsAwaiting ? (
          <Skeleton aria-hidden='true' className={cn('h-7 w-32', PENDING_REVEAL)} />
        ) : (
          <p className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5'>
            <data value={runtime.counts.active} className='text-xl font-semibold tabular-nums'>
              {runtime.counts.active}
            </data>
            <span className='text-xs text-muted-foreground tabular-nums'>
              {t('connections.peak', { count: Math.max(runtime.historyPeak, runtime.counts.active) })}
            </span>
          </p>
        )}
        {/* The minute is seeded from the daemon history: it is drawn before the first snapshot. */}
        <OverviewTrend
          samples={minute}
          stepSeconds={HISTORY_STEP_SECONDS}
          capacity={Math.max(runtime.historyPeak, 1)}
          format={String}
          label={t('connections.history')}
        />
        {!runtime.connectionsAwaiting && (
          <p className='text-xs text-muted-foreground tabular-nums'>
            {t('connections.closedSince', { count: runtime.counts.closed })}
          </p>
        )}
      </div>
    </ConnectionSummaryPanel>
  );
}
