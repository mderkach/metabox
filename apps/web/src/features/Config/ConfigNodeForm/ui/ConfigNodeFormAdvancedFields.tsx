import { ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, FieldLegend, FieldSet } from '@shared/ui';

import { useHasError } from './ConfigNodeForm.error';
import { NS } from './ConfigNodeForm.namespace';

/**
 * Disclosure of empty fields. Collapsed fields are not mounted, and form values are not lost.
 * `names` are the form names of the fields inside: a field with a remark keeps the disclosure open.
 */
export function ConfigNodeFormAdvancedFields({ names, children }: { names: readonly string[]; children: ReactNode }) {
  const { t } = useTranslation(NS);
  const [open, setOpen] = useState(false);
  const hasError = useHasError(names);

  if (hasError && !open) {
    setOpen(true);
  }

  const contentId = useId();

  return (
    <FieldSet className='min-w-0 gap-4 rounded-lg border border-border p-3'>
      <FieldLegend variant='label' className='mb-0 px-1'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-expanded={open}
          aria-controls={contentId}
          className='-mx-1 text-xs'
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
          {t('advanced', { count: names.length })}
        </Button>
      </FieldLegend>
      <div id={contentId} hidden={!open} className='flex flex-col gap-5'>
        {open && children}
      </div>
    </FieldSet>
  );
}
