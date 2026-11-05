import { use, useState, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { SidePanelContext } from './SidePanelLayout.context';

export function SidePanelLayoutPanel({ className, children }: { className?: string; children: ReactNode }) {
  const { open, settled } = use(SidePanelContext);
  const [held, setHeld] = useState<ReactNode>(open ? children : null);

  if (open && held !== children) {
    setHeld(children);
  }

  const shown = open ? children : !settled && held;

  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 z-10 flex max-w-full justify-end overflow-x-clip pl-6 *:*:shadow-xl',
        settled && 'invisible'
      )}
    >
      <div
        data-slot='side-panel'
        className={cn(
          'pointer-events-auto grid w-md max-w-full shrink-0 grid-rows-[minmax(0,1fr)] transition-[opacity,translate] ease-(--motion-ease-out) motion-reduce:transition-none',
          open
            ? 'translate-x-0 opacity-100 duration-(--motion-enter)'
            : 'translate-x-full opacity-0 duration-(--motion-exit)',
          className
        )}
      >
        {shown}
      </div>
    </div>
  );
}
