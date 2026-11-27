import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input, Label } from '@shared/ui';

import { RULE_SET_REMOTE_FORM_NS } from '../i18n/RuleSetRemoteForm.namespace.generated';
import { type RuleSetRemoteFormModel } from '../model/RuleSetRemoteForm.schema';
import { RuleSetRemoteFieldError } from './RuleSetRemoteFieldError';

/** Set name: rules refer to it by it, so it is unique. */
export function RuleSetRemoteTagField() {
  const { t } = useTranslation(RULE_SET_REMOTE_FORM_NS);
  const { control } = useFormContext<RuleSetRemoteFormModel>();
  const id = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name='tag'
      render={({ field, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.tag.label')}</Label>
          <Input
            ref={field.ref}
            id={id}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={t('field.tag.placeholder')}
            autoComplete='off'
            spellCheck={false}
            className='font-mono'
            aria-invalid={fieldState.error !== undefined}
            aria-describedby={fieldState.error === undefined ? undefined : errorId}
          />
          <RuleSetRemoteFieldError id={errorId} message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}
