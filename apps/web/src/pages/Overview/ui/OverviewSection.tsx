import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { SECTION_HEADING } from '@shared/ui';

export function OverviewSection({
  title,
  note,
  children,
}: {
  title: string;
  /** Right-hand label: where the data comes from or context shared by the section. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground'>
        <h2 className={cn(SECTION_HEADING, 'text-foreground')}>{title}</h2>
        {note !== undefined && (
          <p>
            <span aria-hidden='true'>· </span>
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
