import { cn } from '@shared/lib/utils';

export function OverviewOutboundName({
  tag,
  label,
  stacked = false,
  className,
}: {
  tag: string;
  label?: string | undefined;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0', stacked ? 'flex-col' : 'items-baseline gap-1.5', className)}>
      {label !== undefined && (
        <span className='min-w-0 truncate font-sans font-medium' title={label}>
          {label}
        </span>
      )}
      <span
        className={cn(
          'min-w-0 truncate font-mono',
          (stacked || label !== undefined) && 'text-xs text-muted-foreground'
        )}
        title={tag}
      >
        {tag}
      </span>
    </span>
  );
}
