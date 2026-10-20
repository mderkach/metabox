import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

import { ConnectionCloseAll } from './ConnectionCloseAll';

/**
 * List actions. They sit in the table toolbar, not in the page header: they
 * work with its rows, and at a distance the link is not read. "Close all" is
 * rare and irreversible, so it is in the list menu, not a button next to pause.
 */
export function ConnectionActions({
  paused,
  onTogglePause,
  closableCount,
  onCloseAll,
}: {
  paused: boolean;
  onTogglePause: () => void;
  /** How many live connections "Close all" will tear; `0` dims the button, `null` means a tab without live connections, no action. */
  closableCount: number | null;
  onCloseAll: () => void;
}) {
  const { t } = useTranslation('pages/Connections');

  return (
    <>
      <Button variant='outline' size='sm' onClick={onTogglePause}>
        {paused ? t('resume') : t('pause')}
      </Button>

      {closableCount !== null && (
        <>
          <ConnectionCloseAll count={closableCount} disabled={closableCount === 0} onConfirm={onCloseAll} />
        </>
      )}
    </>
  );
}
