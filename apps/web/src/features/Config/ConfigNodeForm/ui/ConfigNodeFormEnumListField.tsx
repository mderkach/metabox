import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ToggleGroup, ToggleGroupItem } from '@shared/ui';

import { packList, unpackList, type ConfigNodeFormModel } from '../model';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldName } from './ConfigNodeFormFieldName';

/** Set of enum values: each is turned on by its own button. */
export function ConfigNodeFormEnumListField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const labelId = useId();
  const errorId = useId();
  const options = field.options ?? [];

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <span id={labelId} className='flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium'>
            <ConfigNodeFormFieldName label={label} fieldKey={field.key} />
          </span>
          <ToggleGroup
            multiple
            spacing={1}
            className='flex-wrap'
            aria-labelledby={labelId}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            value={unpackList(input.value)}
            onValueChange={(next) => {
              // The order is the schema order, not the press order: otherwise
              // the same set would give different file text.
              input.onChange(
                packList(
                  options.filter((option) => next.includes(option)),
                  field.listable === true
                )
              );
            }}
          >
            {options.map((option) => (
              <ToggleGroupItem key={option} value={option} variant='outline' size='sm' className='font-mono text-xs'>
                {option}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {fieldState.invalid && (
            <p id={errorId} role='alert' className='text-xs text-destructive'>
              {errorText(t, fieldState.error)}
            </p>
          )}
        </div>
      )}
    />
  );
}
