import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { type RuleSetCatalog } from '@entities/RuleSet';
import { Input, Label } from '@shared/ui';

import { RULE_SET_REMOTE_FORM_NS } from '../i18n/RuleSetRemoteForm.namespace.generated';
import { CUSTOM_PROVIDER } from '../model/RuleSetAdd.constants';
import { useSelectedList } from '../model/RuleSetAdd.selection';
import { type RuleSetRemoteFormModel } from '../model/RuleSetRemoteForm.schema';
import { RuleSetAddCategoryNotice } from './RuleSetAddCategoryNotice';
import { RuleSetAddMirrorField } from './RuleSetAddMirrorField';
import { RuleSetRemoteFieldError } from './RuleSetRemoteFieldError';

/**
 * Address and mirror. Shown in full: it shows exactly what will go into the
 * config, and hand editing switches the form to "own source", since the panel
 * may not guess a provider from a foreign address.
 */
export function RuleSetAddAddressField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation(RULE_SET_REMOTE_FORM_NS);
  const { control, setValue } = useFormContext<RuleSetRemoteFormModel>();
  const list = useSelectedList(catalog);
  const id = useId();
  const errorId = useId();

  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{t('field.url.label')}</Label>

      <Controller
        control={control}
        name='url'
        render={({ field, fieldState }) => (
          <>
            <Input
              ref={field.ref}
              id={id}
              value={field.value}
              onBlur={field.onBlur}
              placeholder={t('field.url.placeholder')}
              autoComplete='off'
              spellCheck={false}
              className='font-mono text-xs'
              aria-invalid={fieldState.error !== undefined}
              aria-describedby={fieldState.error === undefined ? undefined : errorId}
              onChange={(event) => {
                field.onChange(event.target.value);
                setValue('providerId', CUSTOM_PROVIDER);
                setValue('mirrorId', '');
              }}
            />
            <RuleSetRemoteFieldError id={errorId} message={fieldState.error?.message} />
          </>
        )}
      />

      {list !== null && list.mirrors.length > 1 && <RuleSetAddMirrorField list={list} />}

      <RuleSetAddCategoryNotice list={list} />
    </div>
  );
}
