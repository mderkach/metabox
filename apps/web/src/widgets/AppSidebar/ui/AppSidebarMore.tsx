import { Ellipsis, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@shared/ui';

import { AppSidebarControls } from './AppSidebarControls';

/**
 * Пункт «Ещё» нижней панели: подвал сайдбара — состояние службы, режим
 * маршрутизации, тема и язык — листом снизу. На телефоне ему нет места
 * рядом с разделами, а терять его нельзя.
 */
export function AppSidebarMore({ className }: { className: string }) {
  const { t } = useTranslation('widgets/AppSidebar');

  return (
    <Sheet>
      <SheetTrigger className={className}>
        <Ellipsis aria-hidden='true' className='size-5 shrink-0' />
        <span className='max-w-full truncate'>{t('more.label')}</span>
      </SheetTrigger>
      <SheetContent side='bottom' showCloseButton={false} className='gap-0 pb-[env(safe-area-inset-bottom)]'>
        <header className='flex items-center justify-between gap-2 border-b border-border py-1.5 pr-1.5 pl-4'>
          <SheetTitle>{t('more.title')}</SheetTitle>
          {/* Своя кнопка вместо встроенной: у той подпись зашита по-английски. */}
          <SheetClose render={<Button variant='ghost' size='icon' className='size-11' />} aria-label={t('more.close')}>
            <X aria-hidden='true' />
          </SheetClose>
        </header>
        <div className='flex flex-col gap-3 p-4'>
          <AppSidebarControls collapsed={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
