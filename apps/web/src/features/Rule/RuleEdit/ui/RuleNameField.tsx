import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input, Label } from '@shared/ui';

import type { RuleEditModel } from '../model/RuleEdit.schema';

/** `placeholder` is the label the rule gets without a name, so an empty field shows what it will be called. */
export function RuleNameField({ placeholder }: { placeholder: string }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control } = useFormContext<RuleEditModel>();
  const id = useId();
  const hintId = useId();

  return (
    <Controller
      control={control}
      name='name'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.name.label')}</Label>
          <Input
            id={id}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            autoComplete='off'
            aria-describedby={hintId}
          />
          <p id={hintId} className='text-xs text-pretty text-muted-foreground'>
            {t('field.name.hint')}
          </p>
        </div>
      )}
    />
  );
}
