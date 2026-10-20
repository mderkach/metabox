import { XIcon } from 'lucide-react';

import { Button } from './shadcn/button';
import { DialogClose } from './shadcn/dialog';

/** The corner close button with a label in the interface language: the primitive's own one says "Close". */
export function DialogCloseButton({ label }: { label: string }) {
  return (
    <DialogClose
      render={<Button variant='ghost' size='icon-sm' className='absolute top-2 right-2' aria-label={label} />}
    >
      <XIcon />
    </DialogClose>
  );
}
