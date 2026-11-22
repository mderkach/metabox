import { cn } from '@shared/lib/utils';

export function ProxyCompactNodeName({
  tag,
  label,
  selected,
}: {
  tag: string;
  label?: string | undefined;
  selected: boolean;
}) {
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <span aria-hidden='true' className={cn('size-1.5 shrink-0 rounded-full', selected && 'bg-primary')} />
      <span className='flex min-w-0 flex-wrap items-baseline gap-x-1.5 wrap-anywhere'>
        {label !== undefined && <span>{label}</span>}
        <span className={cn('font-mono', label !== undefined && 'text-muted-foreground')}>{tag}</span>
      </span>
    </span>
  );
}
