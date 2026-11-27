import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { SECRET_MASK } from '@shared/lib/secretMask';
import { Field, Label, SecretInput } from '@shared/ui';

import type { RuleSetEditModel } from '../model/RuleSetEdit.schema';

export function RuleSetEditUrlField() {
  const { t } = useTranslation(SHARED_NS);
  const { control } = useFormContext<RuleSetEditModel>();
  const id = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name='url'
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className='gap-1.5'>
          <div className='flex min-h-6 items-center gap-2'>
            <Label htmlFor={id} className='flex-wrap gap-x-2 gap-y-0.5'>
              <span className='font-mono text-xs'>{field.name}</span>
            </Label>
          </div>
          <SecretInput
            id={id}
            label={field.name}
            mask={SECRET_MASK.UrlCredentials}
            value={field.value ?? ''}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            onBlur={field.onBlur}
            onValueChange={(value) => {
              field.onChange(value === '' ? null : value);
            }}
          />
          {fieldState.invalid && (
            <p id={errorId} role='alert' className='text-xs text-destructive'>
              {t('validation.schema')}
            </p>
          )}
        </Field>
      )}
    />
  );
}
