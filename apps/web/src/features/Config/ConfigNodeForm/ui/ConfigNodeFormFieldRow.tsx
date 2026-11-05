import { type ReactNode } from 'react';

import { Field, Label } from '@shared/ui';

import { useFieldLabel } from './ConfigNodeForm.labels';
import { ConfigNodeFormFieldName } from './ConfigNodeFormFieldName';

/** Label, field and field error: a frame shared by value widgets. */
export function ConfigNodeFormFieldRow({
  id,
  name,
  fieldKey,
  errorId,
  error,
  children,
  aside = null,
}: {
  id: string;
  name: string;
  fieldKey: string;
  errorId: string;
  error: string | null;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const label = useFieldLabel(name);

  return (
    <Field data-invalid={error !== null} className='gap-1.5'>
      <div className='flex min-h-6 items-center gap-2'>
        <Label htmlFor={id} className='flex-wrap gap-x-2 gap-y-0.5'>
          <ConfigNodeFormFieldName label={label} fieldKey={fieldKey} />
        </Label>
        {aside}
      </div>
      {children}
      {error !== null && (
        <p id={errorId} role='alert' className='text-xs text-destructive'>
          {error}
        </p>
      )}
    </Field>
  );
}
