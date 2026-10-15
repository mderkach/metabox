import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys } from 'i18next';
import { LockKeyhole } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ApiError, failureText, type ApiFailureCode } from '@shared/api';
import { Button, Card, CardContent, CardDescription, CardHeader, Input } from '@shared/ui';

import { useLogin } from '../api';
import { AUTH_LOGIN_ERROR, AuthLoginSchema, type AuthLoginModel } from '../model';

type LoginKey = ParseKeys<'features/Auth/AuthLogin'>;

const FIELD_ERROR_KEY: Readonly<Record<string, LoginKey | undefined>> = {
  [AUTH_LOGIN_ERROR.Required]: 'error.required',
};

/** Refusals the login form explains in its own words; the rest go through the shared failure table. */
const REFUSAL_KEY: Readonly<Record<string, LoginKey | undefined>> = {
  password_wrong: 'error.wrong',
  login_locked: 'error.locked',
} satisfies Partial<Record<ApiFailureCode, LoginKey>>;

function refusalText(error: unknown, t: (key: LoginKey) => string): string {
  if (error instanceof ApiError && error.code !== null) {
    const key = REFUSAL_KEY[error.code];

    if (key !== undefined) {
      return t(key);
    }
  }

  return failureText(error) ?? (error instanceof Error ? error.message : t('error.unknown'));
}

/**
 * Login screen. It replaces the whole panel, the sidebar included: without a session
 * every request of the shell gets 401.
 */
export function AuthLoginPage() {
  const { t } = useTranslation('features/Auth/AuthLogin');
  const login = useLogin();
  const inputId = useId();
  const errorId = useId();
  const form = useForm<AuthLoginModel>({
    defaultValues: { password: '' },
    resolver: zodResolver(AuthLoginSchema),
  });

  const onSubmit = form.handleSubmit(({ password }) => {
    login.mutate(password, {
      onError: () => {
        form.setValue('password', '');
        form.setFocus('password');
      },
    });
  });

  return (
    <main className='flex h-full items-center justify-center bg-background p-4 text-foreground'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <h1 className='flex items-center gap-2 text-lg font-semibold'>
            <LockKeyhole aria-hidden='true' className='size-5 text-muted-foreground' />
            {t('title')}
          </h1>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className='flex flex-col gap-3'
            noValidate
            onSubmit={(event) => {
              void onSubmit(event);
            }}
          >
            <Controller
              control={form.control}
              name='password'
              render={({ field, fieldState }) => {
                const fieldKey =
                  fieldState.error?.message === undefined ? undefined : FIELD_ERROR_KEY[fieldState.error.message];
                const message = fieldKey === undefined ? null : t(fieldKey);
                const refusal = login.isError ? refusalText(login.error, t) : null;
                const shown = message ?? refusal;

                return (
                  <div className='flex flex-col gap-1.5'>
                    <label htmlFor={inputId} className='text-sm font-medium'>
                      {t('field.password')}
                    </label>
                    <Input
                      id={inputId}
                      type='password'
                      autoComplete='current-password'
                      // The screen exists only to type the password: focus goes straight into the field.
                      // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
                      autoFocus
                      aria-invalid={shown !== null}
                      aria-describedby={shown === null ? undefined : errorId}
                      {...field}
                    />
                    {shown !== null && (
                      <p id={errorId} role='alert' className='text-xs text-destructive'>
                        {shown}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Button type='submit' disabled={login.isPending}>
              {t('submit')}
            </Button>
            <p className='text-xs text-muted-foreground'>{t('reset')}</p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
