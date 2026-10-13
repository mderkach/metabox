import { Ellipsis } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  DESTRUCTIVE_OUTLINE,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui';

/**
 * Tearing all live connections. Asks for confirmation: the action cannot be
 * undone, and the consequence is visible not on screen but on the devices in
 * the network.
 *
 * The outline is in the danger tone, not a fill: a filled tone among ordinary
 * buttons reads as an error message.
 *
 * `compact` hides the action in the list menu: on a phone the toolbar wraps,
 * and a separate button would sit under the search, in the thumb zone. The
 * dialog is the same, and focus returns after it to the menu button, since the
 * item is closed by then.
 */
export function ConnectionCloseAll({
  count,
  disabled = false,
  compact = false,
  onConfirm,
}: {
  count: number;
  disabled?: boolean;
  compact?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('pages/Connections');
  const [open, setOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  const onConfirmClick = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm]);

  const onMenuItemClick = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <>
      {compact && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button ref={menuTrigger} variant='ghost' size='icon-sm' aria-label={t('listActions')} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-auto'>
            <DropdownMenuItem variant='destructive' disabled={disabled} onClick={onMenuItemClick}>
              {t('closeAll.menuItem')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        {!compact && (
          <AlertDialogTrigger
            render={<Button variant='outline' size='sm' disabled={disabled} className={DESTRUCTIVE_OUTLINE} />}
          >
            {t('closeAll.action')}
          </AlertDialogTrigger>
        )}

        <AlertDialogContent finalFocus={compact ? menuTrigger : undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('closeAll.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('closeAll.description', { count })}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel', { ns: 'shared' })}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={onConfirmClick}>
              {t('closeAll.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
