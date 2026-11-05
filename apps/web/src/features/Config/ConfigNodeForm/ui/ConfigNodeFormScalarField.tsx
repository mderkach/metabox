import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@shared/ui';

import { parseScalar, toInputText, type ConfigNodeFormModel } from '../model';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';

/** String or number in one field: `routing_mark` can be both `255` and `"0xff"`. */
export function ConfigNodeFormScalarField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
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
            value={toInputText(input.value)}
            autoComplete='off'
            spellCheck={false}
            className='font-mono text-xs'
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            onBlur={input.onBlur}
            onChange={(event) => {
              input.onChange(parseScalar(event.target.value));
            }}
          />
        </ConfigNodeFormFieldRow>
      )}
    />
  );
}
