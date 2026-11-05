import { type ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

export function ConnectionTableRoot({ children }: { children: ReactNode }) {
  return (
    <section className={cn('flex min-h-0 grow flex-col overflow-hidden max-lg:min-h-96', SURFACE)}>{children}</section>
  );
}
