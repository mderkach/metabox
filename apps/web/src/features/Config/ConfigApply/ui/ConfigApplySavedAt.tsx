import { formatDateTime } from '@shared/lib/format';

export function ConfigApplySavedAt({ at }: { at: number }) {
  const saved = new Date(at);

  return (
    <time dateTime={saved.toISOString()} className='text-xs text-muted-foreground'>
      {formatDateTime(saved)}
    </time>
  );
}
