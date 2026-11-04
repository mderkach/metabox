import { type ReactNode } from 'react';

import { cn } from '../lib/utils';

export function SidePanelLayoutMain({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>{children}</div>;
}
