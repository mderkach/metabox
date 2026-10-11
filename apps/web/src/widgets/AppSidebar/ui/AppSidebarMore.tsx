import { Link } from '@tanstack/react-router';
import { Ellipsis, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@shared/ui';

import { NAV_ITEMS } from '../model';
import { AppSidebarControls } from './AppSidebarControls';

const LINK_CLASS =
  'flex h-11 items-center gap-3 rounded-md px-2.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * Пункт «Ещё» нижней панели: разделы, которым не хватило колонки, и подвал
 * сайдбара — состояние службы, тема и язык — листом
 * снизу. На телефоне им нет места рядом с разделами, а терять их нельзя.
 */
export function AppSidebarMore({ className, active }: { className: string; active: string | null }) {
  const { t } = useTranslation('widgets/AppSidebar');
  // Лист управляемый: переход по разделу из него должен его закрыть.
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
        <nav aria-label={t('more.sections')} className='border-b border-border p-2'>
          <ul className='flex flex-col'>
            {NAV_ITEMS.map((item) =>
              item.more === true && item.to !== undefined ? (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    activeOptions={{ exact: true }}
                    aria-current={item.to === active ? 'page' : undefined}
                    className={cn(
                      LINK_CLASS,
                      item.to === active
                        ? 'bg-sidebar-accent font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    <item.icon aria-hidden='true' className='size-5 shrink-0' />
                    {t(item.key, { ns: 'shared' })}
                  </Link>
                </li>
              ) : null
            )}
          </ul>
        </nav>
        <div className='flex flex-col gap-3 p-4'>
          <AppSidebarControls collapsed={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
