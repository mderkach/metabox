import { Ellipsis } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui';

/**
 * Tearing all live connections, from the list menu and after a confirmation:
 * it cannot be undone, and its effect shows on the devices, not on screen.
 * Focus returns to the menu button, since the item is gone by then.
 */
export function ConnectionCloseAll({
  count,
  disabled = false,
  onConfirm,
}: {
  count: number;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('pages/Connections');
  const [open, setOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  const onMenuItemClick = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <>
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

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('closeAll.title')}
        description={t('closeAll.description', { count })}
        cancelLabel={t('action.cancel', { ns: 'shared' })}
        confirmLabel={t('closeAll.confirm')}
        destructive
        finalFocus={menuTrigger}
        onConfirm={onConfirm}
      />
    </>
  );
}
