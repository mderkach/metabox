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
 * Разрыв всех живых соединений. Спрашивает подтверждение: отменить действие
 * нельзя, а последствие видно не на экране, а на устройствах в сети.
 *
 * Контур в тоне опасности, а не заливка: залитый тон среди обычных кнопок
 * читается как сообщение об ошибке.
 *
 * `compact` прячет действие в меню списка: на телефоне тулбар переносится, и
 * отдельная кнопка встаёт под поиском, в зоне большого пальца. Диалог тот же,
 * фокус после него возвращается на кнопку меню — пункт к тому времени закрыт.
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
