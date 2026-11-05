import { useId } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Input } from '@shared/ui';

import { PASSWORD_LIMIT, type AuthPasswordModel } from '../model';
import { FIELD_ERROR_KEY } from './AuthPassword.error';

export function AuthPasswordField({
  control,
  name,
  label,
  hint,
  autoComplete,
}: {
  control: Control<AuthPasswordModel>;
  name: keyof AuthPasswordModel;
  label: string;
  hint?: string;
  autoComplete: string;
}) {
  const { t } = useTranslation('features/Auth/AuthPassword');
  const inputId = useId();
  const noteId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const errorKey =
          fieldState.error?.message === undefined ? undefined : FIELD_ERROR_KEY[fieldState.error.message];
        const error = errorKey === undefined ? null : t(errorKey, { min: PASSWORD_LIMIT.Min, max: PASSWORD_LIMIT.Max });
        const note = error ?? hint ?? null;

        return (
          <div className='flex flex-col gap-1.5'>
            <label htmlFor={inputId} className='text-sm font-medium'>
              {label}
            </label>
            <Input
              id={inputId}
              type='password'
              autoComplete={autoComplete}
              aria-invalid={error !== null}
              aria-describedby={note === null ? undefined : noteId}
              {...field}
            />
            {note !== null && (
              <p
                id={noteId}
                role={error === null ? undefined : 'alert'}
                className={cn('text-xs', error === null ? 'text-muted-foreground' : 'text-destructive')}
              >
                {note}
              </p>
            )}
          </div>
        );
      }}
    />
  );
}
