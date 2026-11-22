import { cn } from '@shared/lib/utils';

export function ProxyMetadataName({ tag, label }: { tag: string; label?: string | undefined }) {
  return (
    <span className='flex min-w-0 flex-col'>
      {label !== undefined && (
        <span className='truncate' title={label}>
          {label}
        </span>
      )}
      <span className={cn('truncate font-mono', label !== undefined && 'text-xs text-muted-foreground')} title={tag}>
        {tag}
      </span>
    </span>
  );
}
