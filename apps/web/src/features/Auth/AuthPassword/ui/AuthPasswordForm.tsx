import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, FORM_ACTIONS } from '@shared/ui';

import { useRemovePassword, useSetPassword } from '../api';
import {
  AUTH_PASSWORD_ERROR,
  AuthPasswordRemoveSchema,
  PASSWORD_LIMIT,
  toAuthPasswordSchema,
  type AuthPasswordModel,
} from '../model';
import { refusalText } from './AuthPassword.error';
import { AuthPasswordField } from './AuthPasswordField';

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
        <AuthPasswordField
          control={form.control}
          name='current'
          label={t('field.current')}
          autoComplete='current-password'
        />
      )}
      <AuthPasswordField
        control={form.control}
        name='password'
        label={t('field.password')}
        hint={t('field.hint', { min: PASSWORD_LIMIT.Min, max: PASSWORD_LIMIT.Max })}
        autoComplete='new-password'
      />
      <AuthPasswordField control={form.control} name='confirm' label={t('field.confirm')} autoComplete='new-password' />

      {failed !== null && (
        <p role='alert' className='text-sm text-destructive'>
          {refusalText(failed, t)}
        </p>
      )}

      <div className={FORM_ACTIONS}>
        {protectedPanel && (
          <Button type='button' variant='outline' disabled={pending} className='mr-auto' onClick={onRemove}>
            {t('remove')}
          </Button>
        )}
        <Button type='submit' disabled={pending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
