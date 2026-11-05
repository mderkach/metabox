import { cn } from '@shared/lib/utils';

export function DaemonServiceRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className='flex items-center justify-between gap-4 border-t border-border py-2 first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={cn('min-w-0 truncate', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
