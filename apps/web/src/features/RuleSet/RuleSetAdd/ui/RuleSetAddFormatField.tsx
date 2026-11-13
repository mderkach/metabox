import { useId } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { defaultFormatOf } from '@entities/RuleSet';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { describedBy } from '../lib/RuleSetAdd.descriptions';
import { RULE_SET_FORMAT_OPTIONS } from '../model/RuleSetAdd.constants';
import { type RuleSetAddModel } from '../model/RuleSetAdd.schema';
import { RuleSetAddFieldError } from './RuleSetAddFieldError';

/**
 * File format. The field appears only when it cannot be derived from the
 * address: for `.srs` and `.json` core derives the format itself, and a written
 * value would be an edit the user did not make.
 */
export function RuleSetAddFormatField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const url = useWatch({ control, name: 'url' });
  const id = useId();
  const hintId = useId();
  const errorId = useId();

  if (url.trim() === '' || defaultFormatOf(url.trim()) !== '') {
    return null;
  }

  return (
    <Controller
      control={control}
      name='format'
      render={({ field, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.format.label')}</Label>
          <Select
            items={RULE_SET_FORMAT_OPTIONS.map((format) => ({ value: format, label: t(`format.${format}`) }))}
            value={field.value}
            onValueChange={field.onChange}
            // Opening the list moves focus off the trigger: the field is touched
            // when the list closes, so a required format is not flagged mid-choice.
            onOpenChange={(open) => {
              if (!open) field.onBlur();
            }}
          >
            <SelectTrigger
              ref={field.ref}
              id={id}
              aria-describedby={describedBy(hintId, fieldState.error === undefined ? undefined : errorId)}
            >
              <SelectValue placeholder={t('field.format.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {RULE_SET_FORMAT_OPTIONS.map((format) => (
                <SelectItem key={format} value={format}>
                  {t(`format.${format}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={hintId} className='text-xs text-muted-foreground'>
            {t('field.format.hint')}
          </p>
          <RuleSetAddFieldError id={errorId} message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}
