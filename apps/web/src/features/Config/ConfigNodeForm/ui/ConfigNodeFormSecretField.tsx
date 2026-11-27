import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { SecretMask } from '@shared/lib/secretMask';
import { SecretInput } from '@shared/ui';

import { CONFIG_NODE_FORM_NS } from '../i18n/ConfigNodeForm.namespace.generated';
import { toInputText, UNSET, type ConfigNodeFormModel } from '../model';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';

export function ConfigNodeFormSecretField({ field, name, mask }: NodeFieldProps & { mask: SecretMask }) {
  const { t } = useTranslation(CONFIG_NODE_FORM_NS);
  const label = useFieldLabel(name) ?? field.key;
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
          <SecretInput
            id={id}
            label={label}
            mask={mask}
            value={toInputText(input.value)}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            onBlur={input.onBlur}
            onValueChange={(value) => {
              input.onChange(value === '' ? UNSET : value);
            }}
          />
        </ConfigNodeFormFieldRow>
      )}
    />
  );
}
