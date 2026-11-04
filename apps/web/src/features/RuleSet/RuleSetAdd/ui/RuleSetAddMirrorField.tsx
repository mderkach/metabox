import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { type RuleSetList } from '@entities/RuleSet';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { composeRuleSetURL, type RuleSetAddModel } from '../model/RuleSetAdd.schema';

/** Provider mirror: rebuilds the address without touching the rest of the form. */
export function RuleSetAddMirrorField({ list }: { list: RuleSetList }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const id = useId();

  return (
    <Controller
      control={control}
      name='mirrorId'
      render={({ field }) => (
        <div className='flex items-center gap-2'>
          <Label htmlFor={id}>{t('field.mirror.label')}</Label>
          <Select
            items={list.mirrors.map((mirror) => ({ value: mirror.id, label: mirror.name }))}
            value={field.value}
            onValueChange={(value: string | null) => {
              const next = value ?? list.mirrors[0].id;
              field.onChange(next);
              setValue('url', composeRuleSetURL(list, next, getValues('category')));
            }}
          >
            <SelectTrigger id={id} size='sm' className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {list.mirrors.map((mirror) => (
                <SelectItem key={mirror.id} value={mirror.id}>
                  {mirror.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}
