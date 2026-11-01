import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { SECTION_HEADING } from '@shared/ui';

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-3'>
      <h2 className={cn(SECTION_HEADING, 'text-foreground')}>{title}</h2>
      {children}
    </section>
  );
}
