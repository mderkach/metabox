import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { SHEET_BOTTOM, Sheet, SheetContent } from '@shared/ui';

import { ConfigNodePanel } from './ConfigNodePanel';

/**
 * Node panel as a sheet on top of the list — on a narrow screen, where there is no room for it
 * beside the list. The sheet slides away with an animation after closing, so the page
 * gives the title and form to the closed sheet too: otherwise it would slide away empty.
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
      <SheetContent side='bottom' showCloseButton={false} className={cn(SHEET_BOTTOM, 'max-h-[85svh] gap-0 p-0')}>
        <ConfigNodePanel title={title} sheet onClose={onClose}>
          {children}
        </ConfigNodePanel>
      </SheetContent>
    </Sheet>
  );
}
