import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@shared/ui';

import { CONFIG_NODE_FORM_NS } from '../i18n/ConfigNodeForm.namespace.generated';
import { parseNumber, toInputText, type ConfigNodeFormModel } from '../model';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';

export function ConfigNodeFormNumberField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(CONFIG_NODE_FORM_NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();

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
          <Input
            id={id}
            type='number'
            value={toInputText(input.value)}
            className='font-mono text-xs'
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            onBlur={input.onBlur}
            onChange={(event) => {
              input.onChange(parseNumber(event.target.value));
            }}
          />
        </ConfigNodeFormFieldRow>
      )}
    />
  );
}
