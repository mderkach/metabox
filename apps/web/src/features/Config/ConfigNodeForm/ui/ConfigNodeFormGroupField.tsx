import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { cn } from '@shared/lib/utils';
import { Button, FieldLegend, FieldSet } from '@shared/ui';

import { countFilled, isFilledGroup, type ConfigNodeFormModel } from '../model';
import { useHasError } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { ConfigNodeFormFieldName } from './ConfigNodeFormFieldName';
import { ConfigNodeFormGroupCount } from './ConfigNodeFormGroupCount';

/** A group this small reads as one block: a collapse would hide two fields behind a click. */
const FLAT_GROUP_FIELDS = 3;

/**
 * Nested object: its own fields under a common label, with the count of set fields so a
 * collapsed group still tells whether there is anything in it. A small group is a flat
 * subsection; a larger one is collapsed while nothing in it is set: a long type would otherwise
 * open as a wall of TLS and multiplex fields. Collapsed fields are not mounted, and form values
 * are not lost; a group with a remark inside stays open.
 */
export function ConfigNodeFormGroupField({ field, name, children }: NodeFieldProps) {
  const label = useFieldLabel(name);
  const { control, getValues } = useFormContext<ConfigNodeFormModel>();
  const value: unknown = useWatch({ control, name });
  const total = field.children?.length ?? 0;
  const flat = total <= FLAT_GROUP_FIELDS;
  const [open, setOpen] = useState(() => flat || isFilledGroup(getValues(name)));
  const hasError = useHasError([name]);

  if (hasError && !open) {
    setOpen(true);
  }

  const contentId = useId();
  const filled = countFilled(value);

  if (flat) {
    return (
      <FieldSet className='min-w-0 gap-4 border-l border-border pl-3'>
        <FieldLegend variant='label' className='mb-0 flex flex-wrap items-baseline gap-x-2'>
          <ConfigNodeFormFieldName label={label} fieldKey={field.key} />
          <ConfigNodeFormGroupCount filled={filled} total={total} />
        </FieldLegend>
        {children}
      </FieldSet>
    );
  }

  return (
    <FieldSet className='min-w-0 gap-4 rounded-lg border border-border p-3'>
      <FieldLegend variant='label' className='mb-0 flex flex-wrap items-center gap-x-2 px-1'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-expanded={open}
          aria-controls={contentId}
          className='-mx-1'
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
          <ConfigNodeFormFieldName label={label} fieldKey={field.key} />
        </Button>
        <ConfigNodeFormGroupCount filled={filled} total={total} />
      </FieldLegend>
      <div id={contentId} hidden={!open} className='flex flex-col gap-5'>
        {open && children}
      </div>
    </FieldSet>
  );
}
