import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button, Popover, PopoverContent, PopoverDescription, PopoverTrigger } from '@shared/ui';

export function OverviewTrafficHelp({
  label,
  mark,
  children,
}: {
  label: string;
  mark?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        render={
          mark === undefined ? (
            <Button type='button' variant='ghost' size='icon-sm' />
          ) : (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-auto min-h-7 max-w-full px-0.5 whitespace-normal pointer-coarse:min-h-11'
            />
          )
        }
      >
        {mark ?? <Info aria-hidden className='size-4 max-h-full max-w-full' />}
      </PopoverTrigger>
      <PopoverContent
        align='start'
        aria-label={label}
        className='max-h-(--available-height) max-w-[calc(100vw-2rem)] overflow-y-auto in-data-anchor-hidden:invisible motion-reduce:animate-none!'
      >
        <PopoverDescription className='text-popover-foreground'>{children}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
