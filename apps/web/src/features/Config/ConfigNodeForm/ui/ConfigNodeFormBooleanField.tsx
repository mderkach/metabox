import { RotateCcw } from 'lucide-react';
import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, Switch } from '@shared/ui';

import { isUnset, UNSET, type ConfigNodeFormModel } from '../model';
import { errorText } from './ConfigNodeForm.error';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { NS } from './ConfigNodeForm.namespace';
import { ConfigNodeFormFieldRow } from './ConfigNodeFormFieldRow';

/**
 * Flag. Off and unset are different states: `false` is written to the file,
 * while unset leaves the binary its default value. So the flag has a reset that
 * deletes the key.
 */
export function ConfigNodeFormBooleanField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
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
          aside={
            isUnset(input.value) ? (
              <span className='text-xs text-muted-foreground'>{t('boolean.unset')}</span>
            ) : (
              <Button
                type='button'
                variant='ghost'
                size='icon-xs'
                aria-label={t('boolean.reset', { name: label })}
                onClick={() => {
                  input.onChange(UNSET);
                }}
              >
                <RotateCcw />
              </Button>
            )
          }
        >
          <Switch
            id={id}
            checked={input.value === true}
            aria-invalid={fieldState.invalid}
            onBlur={input.onBlur}
            onCheckedChange={(checked) => {
              input.onChange(checked);
            }}
          />
        </ConfigNodeFormFieldRow>
      )}
    />
  );
}
