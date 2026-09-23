import type { ReactNode } from 'react';

/**
 * Шапка экрана. `children` — состояние экрана: вердикт обзора, ход потока
 * соединений, документ конфигурации и его черновик; пояснения к содержимому
 * стоят у своей секции, а не здесь. `actions` — действия над документом
 * экрана, например история версий, а не действия над списком: те живут в
 * карточке списка, см. Tables.md.
 *
 * Именована для View Transitions: при смене раздела шапка растворяется на
 * месте, а не уезжает вместе с содержимым; между вкладками одного раздела она
 * стоит живой.
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
