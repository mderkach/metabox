import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Skeleton } from '@shared/ui';

export function OverviewProcessRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-2 text-sm first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={cn('min-w-0 truncate', mono && 'font-mono text-xs')}>
        {value ?? <Skeleton aria-hidden='true' className={cn('h-4 w-24', PENDING_REVEAL)} />}
      </dd>
    </div>
  );
}
