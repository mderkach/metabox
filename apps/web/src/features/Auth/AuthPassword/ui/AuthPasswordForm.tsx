import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys } from 'i18next';
import { useId, useMemo } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ApiError, failureText, type ApiFailureCode } from '@shared/api';
import { cn } from '@shared/lib/utils';
import { Button, DialogFooter, Input } from '@shared/ui';

import { useRemovePassword, useSetPassword } from '../api';
import {
  AUTH_PASSWORD_ERROR,
  AuthPasswordRemoveSchema,
  PASSWORD_LIMIT,
  toAuthPasswordSchema,
  type AuthPasswordModel,
} from '../model';

type PasswordKey = ParseKeys<'features/Auth/AuthPassword'>;

const FIELD_ERROR_KEY: Readonly<Record<string, PasswordKey | undefined>> = {
  [AUTH_PASSWORD_ERROR.CurrentRequired]: 'error.currentRequired',
  [AUTH_PASSWORD_ERROR.TooShort]: 'error.tooShort',
  [AUTH_PASSWORD_ERROR.TooLong]: 'error.tooLong',
  [AUTH_PASSWORD_ERROR.Mismatch]: 'error.mismatch',
};

const REFUSAL_KEY: Readonly<Record<string, PasswordKey | undefined>> = {
  password_wrong: 'error.wrong',
  login_locked: 'error.locked',
} satisfies Partial<Record<ApiFailureCode, PasswordKey>>;

function refusalText(error: unknown, t: (key: PasswordKey) => string): string {
  const key = error instanceof ApiError && error.code !== null ? REFUSAL_KEY[error.code] : undefined;

  if (key !== undefined) {
    return t(key);
  }

  return failureText(error) ?? (error instanceof Error ? error.message : t('error.unknown'));
}

/**
 * Password set, change and removal. `protectedPanel` says whether a password is already set:
 * then the current one is asked for, and the form offers removal.
 */
export function AuthPasswordForm({ protectedPanel, onDone }: { protectedPanel: boolean; onDone: () => void }) {
  const { t } = useTranslation('features/Auth/AuthPassword');
  const save = useSetPassword();
  const remove = useRemovePassword();
  const schema = useMemo(() => toAuthPasswordSchema(protectedPanel), [protectedPanel]);
  const form = useForm<AuthPasswordModel>({
    defaultValues: { current: '', password: '', confirm: '' },
    resolver: zodResolver(schema),
  });

  const failed = save.error ?? remove.error;
  const pending = save.isPending || remove.isPending;

  const onSubmit = form.handleSubmit(({ current, password }) => {
    remove.reset();
    save.mutate({ current, password }, { onSuccess: onDone });
  });

  function onRemove() {
    save.reset();
    form.clearErrors();

    const current = form.getValues('current');

    if (!AuthPasswordRemoveSchema.safeParse({ current }).success) {
      form.setError('current', { message: AUTH_PASSWORD_ERROR.CurrentRequired });
      form.setFocus('current');

      return;
    }

    remove.mutate(current, { onSuccess: onDone });
  }

  return (
    <form
      className='flex flex-col gap-3'
      noValidate
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      {protectedPanel && (
        <PasswordField
          control={form.control}
          name='current'
          label={t('field.current')}
          autoComplete='current-password'
        />
      )}
      <PasswordField
        control={form.control}
        name='password'
        label={t('field.password')}
        hint={t('field.hint', { min: PASSWORD_LIMIT.Min, max: PASSWORD_LIMIT.Max })}
        autoComplete='new-password'
      />
      <PasswordField control={form.control} name='confirm' label={t('field.confirm')} autoComplete='new-password' />

      {failed !== null && (
        <p role='alert' className='text-sm text-destructive'>
          {refusalText(failed, t)}
        </p>
      )}

      <DialogFooter>
        {protectedPanel && (
          <Button type='button' variant='outline' disabled={pending} className='mr-auto' onClick={onRemove}>
            {t('remove')}
          </Button>
        )}
        <Button type='submit' disabled={pending}>
          {t('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PasswordField({
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
