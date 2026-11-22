import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui';

export interface ProxyNodeDiagnosticInfo {
  label: string;
  content: ReactNode;
  status?: { label: string; failed?: boolean };
}

export type ProxyNodeDiagnostics = (name: string, group?: string) => ProxyNodeDiagnosticInfo | undefined;

export function ProxyNodeDiagnostic({
  diagnostic,
  open,
  onToggle,
  panelId,
  inline = false,
}: {
  diagnostic: ProxyNodeDiagnosticInfo;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  inline?: boolean;
}) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon-sm'
      className={cn(
        inline
          ? 'w-9 gap-0.5 pointer-coarse:size-11'
          : 'absolute right-1 bottom-0 w-9 gap-0.5 pointer-coarse:right-0 pointer-coarse:size-11',
        diagnostic.status?.failed === false
          ? 'text-muted-foreground hover:text-muted-foreground aria-expanded:text-muted-foreground'
          : 'text-signal-bad hover:text-signal-bad aria-expanded:text-signal-bad'
      )}
      aria-label={diagnostic.label}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
    >
      <svg
        aria-hidden='true'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2.4'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='size-4'
      >
        <path d='M8 8.7a4.2 4.2 0 1 1 7.1 3c-1.7 1.3-3.1 1.9-3.1 3.9m0 3.4h.01' />
      </svg>
      <ChevronDown
        aria-hidden='true'
        className={cn('size-3 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
      />
    </Button>
  );
}
