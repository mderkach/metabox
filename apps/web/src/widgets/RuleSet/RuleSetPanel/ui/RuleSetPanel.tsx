import { X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useFocusReturn } from '@shared/lib/useFocusReturn';
import { cn } from '@shared/lib/utils';
import { Button, SECTION_HEADING, SURFACE, SURFACE_HEAD, SheetTitle } from '@shared/ui';

/**
 * Панель сета рядом со списком: в ней открывается форма, а список остаётся на
 * месте и не сдвигается вниз (ADR-0037).
 *
 * Своего словаря у панели нет: заголовок называет страница, которая знает,
 * какая форма открыта, а подпись закрытия общая с панелью правила.
 *
 * `sheet` — панель стоит внутри листа поверх списка: рамку и фокус держит лист,
 * а заголовок панели становится его заголовком.
 */
export function RuleSetPanel({
  title,
  sheet = false,
  onClose,
  children,
}: {
  title: string;
  sheet?: boolean;
  onClose: () => void;
  /** Форма, открытая из тулбара списка. */
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
    // Escape закрывает панель: обработчик на контейнере — обычный паттерн для
    // панелей и диалогов, интерактивная роль aside для этого не нужна.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- см. выше
    <aside
      aria-label={title}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !sheet && ['w-full max-w-md shrink-0 max-lg:max-h-[70vh]', SURFACE]
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
