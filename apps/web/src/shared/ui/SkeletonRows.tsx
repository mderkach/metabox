import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import { Skeleton } from './shadcn/skeleton';
import { PENDING_REVEAL } from './styles';

const DEFAULT_ROWS = 6;

/**
 * List loading with skeleton rows. Appears with a delay (`PENDING_REVEAL`):
 * a fast response replaces it before it becomes visible. For a screen reader
 * loading is announced in words — rows of bars say nothing to it.
 */
export function SkeletonRows({
  rows = DEFAULT_ROWS,
  className,
  rowClassName = 'h-5',
}: {
  rows?: number;
  className?: string;
  /** Row height: a line for a list, the whole area for a chart. */
  rowClassName?: string;
}) {
  const { t } = useTranslation('shared');

  return (
    <div role='status' className={cn('flex flex-col gap-3 p-4', PENDING_REVEAL, className)}>
      <span className='sr-only'>{t('source.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} aria-hidden='true' className={rowClassName} />
      ))}
    </div>
  );
}
