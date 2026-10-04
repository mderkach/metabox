import type { ReactNode } from 'react';

import { Sheet, SheetContent } from '@shared/ui';

import { ConfigNodePanel } from './ConfigNodePanel';

/**
 * Панель узла листом поверх списка — на узком экране, где рядом с ним ей нет
 * места. Лист уезжает анимацией уже после закрытия, поэтому заголовок и форму
 * страница отдаёт и закрытому листу: иначе он уезжал бы пустым.
 */
export function ConfigNodePanelSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent side='bottom' showCloseButton={false} className='max-h-[85svh] gap-0 p-0'>
        <ConfigNodePanel title={title} sheet onClose={onClose}>
          {children}
        </ConfigNodePanel>
      </SheetContent>
    </Sheet>
  );
}
