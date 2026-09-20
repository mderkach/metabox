import type { ReactNode } from 'react';

/**
 * Шапка экрана. `actions` — действия самого экрана (история версий,
 * переключение между формами и текстом), а не действия над списком: те живут
 * в карточке списка, см. Tables.md.
 *
 * Именована для View Transitions: при смене экрана шапка растворяется на
 * месте, а не уезжает вместе с содержимым.
 */
export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3 [view-transition-name:page-header] sm:px-6'>
      <h1 className='text-2xl font-semibold'>{title}</h1>
      {children}
      {actions !== undefined && (
        <>
          <span className='grow' />
          {actions}
        </>
      )}
    </header>
  );
}
