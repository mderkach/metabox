import { useTranslation } from 'react-i18next';

import { useNarrowScreen } from '@shared/lib/media';
import { Button, Separator } from '@shared/ui';

import { ConnectionCloseAll } from './ConnectionCloseAll';

/**
 * List actions. They sit in the table toolbar, not in the page header: they
 * work with its rows, and at a distance the link is not read.
 *
 * "Close all" is set apart by a divider: pause changes nothing on the device,
 * while this tears live connections. When there is nothing to tear, the button
 * goes dim but stays in place: after confirmation the dialog returns focus to
 * it, and if it vanished together with the last connection, focus would fall to
 * `body`.
 *
 * On a narrow width "Close all" moves into the list menu: the divider does not
 * separate it from neighbors there, as the toolbar wraps into lines.
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
  const narrow = useNarrowScreen();

  return (
    <>
      <Button variant='outline' size='sm' onClick={onTogglePause}>
        {paused ? t('resume') : t('pause')}
      </Button>

      {closableCount !== null && (
        <>
          {!narrow && <Separator orientation='vertical' className='mx-0.5 h-5' />}
          <ConnectionCloseAll
            count={closableCount}
            disabled={closableCount === 0}
            compact={narrow}
            onConfirm={onCloseAll}
          />
        </>
      )}
    </>
  );
}
