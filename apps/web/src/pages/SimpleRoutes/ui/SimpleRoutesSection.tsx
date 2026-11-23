import { useId, type ReactNode } from 'react';

import { SECTION_HEADING } from '@shared/ui';

export function SimpleRoutesSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <section aria-labelledby={id} className='flex min-w-0 flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 id={id} className={SECTION_HEADING}>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
