import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { type RuleSetCatalog } from '@entities/RuleSet';
import { Input, Label } from '@shared/ui';

import { CUSTOM_PROVIDER } from '../model/RuleSetAdd.constants';
import { type RuleSetAddModel } from '../model/RuleSetAdd.schema';
import { useSelectedList } from '../model/RuleSetAdd.selection';
import { RuleSetAddCategoryNotice } from './RuleSetAddCategoryNotice';
import { RuleSetAddFieldError } from './RuleSetAddFieldError';
import { RuleSetAddMirrorField } from './RuleSetAddMirrorField';

/**
 * Address and mirror. Shown in full: it shows exactly what will go into the
 * config, and hand editing switches the form to "own source", since the panel
 * may not guess a provider from a foreign address.
 */
export function RuleSetAddAddressField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue } = useFormContext<RuleSetAddModel>();
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
            <RuleSetAddFieldError id={errorId} message={fieldState.error?.message} />
          </>
        )}
      />

      {list !== null && list.mirrors.length > 1 && <RuleSetAddMirrorField list={list} />}

      <RuleSetAddCategoryNotice list={list} />
    </div>
  );
}
