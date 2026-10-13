import { Route, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { cn } from '@shared/lib/utils';

const ROW_ACTION =
  'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors pointer-coarse:size-11 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/** Close and explain: the same actions in the table and in the list. */
export function ConnectionRowActions({
  connection,
  onClose,
  onExplain,
  selected,
  panelId,
}: {
  connection: ConnectionRowModel;
  onClose: ((id: string) => void) | null;
  onExplain: ((id: string) => void) | null;
  selected: boolean;
  panelId?: string;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');

  return (
    <>
      {onExplain !== null && (
        <button
          type='button'
          aria-expanded={selected}
          // The link is set only on the panel opened by this row: other
          // rows have no such element in the document.
          aria-controls={selected ? panelId : undefined}
          aria-label={t('row.explain', { host: connection.host })}
          className={cn(ROW_ACTION, 'hover:bg-muted hover:text-foreground', selected && 'text-foreground')}
          onClick={() => {
            onExplain(connection.id);
          }}
        >
          <Route className='size-3.5' />
        </button>
      )}
      {onClose !== null && (
        <button
          type='button'
          aria-label={t('row.close', { host: connection.host })}
          className={cn(ROW_ACTION, 'hover:bg-destructive/15 hover:text-destructive')}
          onClick={() => {
            onClose(connection.id);
          }}
        >
          <X className='size-3.5' />
        </button>
      )}
    </>
  );
}
