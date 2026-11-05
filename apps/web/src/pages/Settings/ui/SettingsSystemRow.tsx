import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Skeleton } from '@shared/ui';

export function SettingsSystemRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-2 first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 truncate font-mono text-xs'>
        {value ?? <Skeleton aria-hidden='true' className={cn('h-4 w-24', PENDING_REVEAL)} />}
      </dd>
    </div>
  );
}
