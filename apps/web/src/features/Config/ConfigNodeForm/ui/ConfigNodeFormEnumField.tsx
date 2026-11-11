import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { UNSET, type ConfigNodeFormModel } from '../model';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';

/** Empty select item: the enum value `""` and "no key" mean the same thing. */
const ENUM_UNSET = '';

export function ConfigNodeFormEnumField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const items = [
    { value: ENUM_UNSET, label: t('enum.unset') },
    ...(field.options ?? [])
      .filter((option) => option !== ENUM_UNSET)
      .map((option) => ({ value: option, label: option })),
  ];

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <ConfigNodeFormFieldRow
          id={id}
          name={name}
          fieldKey={field.key}
          errorId={errorId}
          error={errorText(t, fieldState.error)}
        >
          <Select
            items={items}
            value={typeof input.value === 'string' ? input.value : ENUM_UNSET}
            onValueChange={(next: string | null) => {
              input.onChange(next === null || next === ENUM_UNSET ? UNSET : next);
            }}
          >
            <SelectTrigger
              id={id}
              className='w-full font-mono text-xs'
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? errorId : undefined}
              onBlur={input.onBlur}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value} className='font-mono text-xs'>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ConfigNodeFormFieldRow>
      )}
    />
  );
}
