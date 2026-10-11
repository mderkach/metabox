import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { SHEET_BOTTOM, Sheet, SheetContent } from '@shared/ui';

import { RuleSetPanel } from './RuleSetPanel';

/**
 * Панель сета листом поверх списка — на узком экране, где рядом с ним ей нет
 * места. Лист уезжает анимацией уже после закрытия, поэтому заголовок и форму
 * страница отдаёт и закрытому листу: иначе он уезжал бы пустым.
 */
export function RuleSetPanelSheet({
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
      <SheetContent side='bottom' showCloseButton={false} className={cn(SHEET_BOTTOM, 'max-h-[85svh] gap-0 p-0')}>
        <RuleSetPanel title={title} sheet onClose={onClose}>
          {children}
        </RuleSetPanel>
      </SheetContent>
    </Sheet>
  );
}
