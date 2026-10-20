import { ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { Button, SECTION_HEADING } from '@shared/ui';

/**
 * A section of the overview. `collapsible` folds it under its title, closed
 * at first: on a phone the verdict, traffic and connections come first, and
 * board and process readings are opened when needed.
 */
export function OverviewSection({
  title,
  note,
  collapsible = false,
  children,
}: {
  title: string;
  /** Right-hand label: where the data comes from or context shared by the section. */
  note?: string;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  const contentId = useId();

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground'>
        <h2 className={cn(SECTION_HEADING, 'text-foreground')}>
          {collapsible ? (
            <Button
              variant='ghost'
              aria-expanded={open}
              aria-controls={contentId}
              className={cn(SECTION_HEADING, '-mx-2.5 h-auto px-2.5')}
              onClick={() => {
                setOpen(!open);
              }}
            >
              <ChevronRight
                aria-hidden='true'
                className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')}
              />
              {title}
            </Button>
          ) : (
            title
          )}
        </h2>
        {note !== undefined && (
          <p>
            <span aria-hidden='true'>· </span>
            {note}
          </p>
        )}
      </div>
      <div id={contentId} hidden={!open} className='flex flex-col gap-3'>
        {open && children}
      </div>
    </section>
  );
}
