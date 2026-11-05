import { type JsoncOutlineEntry } from '@shared/lib/jsonc';
import { Button } from '@shared/ui';

export function ConfigRawOutlineEntry({
  entry,
  onJump,
}: {
  entry: JsoncOutlineEntry;
  onJump: (entry: JsoncOutlineEntry) => void;
}) {
  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={() => {
        onJump(entry);
      }}
      className='w-full justify-between font-mono text-xs'
    >
      <span className='truncate'>{entry.key}</span>
      {entry.size !== null && <span className='text-muted-foreground tabular-nums'>{entry.size}</span>}
    </Button>
  );
}
