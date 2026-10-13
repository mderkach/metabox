import { X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useFocusReturn } from '@shared/lib/useFocusReturn';
import { cn } from '@shared/lib/utils';
import { Button, SECTION_HEADING, SURFACE, SURFACE_HEAD, SheetTitle } from '@shared/ui';

/**
 * Section node panel beside the list: the add form opens in it, and
 * nodes stay in place and do not shift down (ADR-0037). The structure is the same
 * as in the rule and rule set panels; they deliberately have no shared frame — the ADR
 * defers it while the panel headers diverge.
 *
 * The panel has no dictionary of its own: the title is named by the page, which knows
 * which form is open, and the close label is shared with the other panels.
 *
 * `sheet` — the panel stands inside a sheet on top of the list: the sheet holds the frame and focus,
 * and the panel title becomes its title.
 */
export function ConfigNodePanel({
  title,
  sheet = false,
  onClose,
  children,
}: {
  title: string;
  sheet?: boolean;
  onClose: () => void;
  /** The form opened from the section toolbar. */
  children: ReactNode;
}) {
  const { t } = useTranslation('shared');
  const headingRef = useFocusReturn<HTMLHeadingElement>();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    // Escape closes the panel: a handler on the container is a common pattern for
    // panels and dialogs, an interactive role on aside is not needed for it.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <aside
      aria-label={title}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !sheet && ['w-full max-w-md shrink-0 max-lg:max-h-[70vh] lg:sticky lg:top-0', SURFACE]
      )}
    >
      <header className={cn('flex items-center gap-2.5', SURFACE_HEAD)}>
        {sheet ? (
          <SheetTitle className={cn('min-w-0 grow', SECTION_HEADING)}>{title}</SheetTitle>
        ) : (
          <h2
            ref={headingRef}
            tabIndex={-1}
            className={cn(
              '-mx-1.5 -my-0.5 min-w-0 grow rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              SECTION_HEADING
            )}
          >
            {title}
          </h2>
        )}
        <Button variant='outline' size='icon-sm' aria-label={t('action.closePanel')} onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4'>{children}</div>
    </aside>
  );
}
