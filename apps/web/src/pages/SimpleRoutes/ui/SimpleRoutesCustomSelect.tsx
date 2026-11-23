import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import type { CustomRuleForm } from '../model/SimpleRoutes.custom';

export function SimpleRoutesCustomSelect({
  name,
  items,
}: {
  name: 'device' | 'outbound';
  items: { value: string; label: string }[];
}) {
  const { t } = useTranslation('pages/SimpleRoutes');
  const { control } = useFormContext<CustomRuleForm>();
  const id = useId();
  return (
    <div className='grid min-w-0 gap-1.5'>
      <Label htmlFor={id}>{t(`custom.${name}`)}</Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            items={items}
            value={field.value || null}
            disabled={items.length === 0}
            onValueChange={(value: string | null) => {
              field.onChange(value ?? '');
            }}
          >
            <SelectTrigger id={id} ref={field.ref} onBlur={field.onBlur} className='w-full min-w-0'>
              <SelectValue
                placeholder={
                  items.length ? t('custom.choose') : t(name === 'device' ? 'custom.noDevices' : 'custom.noExits')
                }
                className='min-w-0 truncate'
              />
            </SelectTrigger>
            <SelectContent>
              {items.map(({ label, value }) => (
                <SelectItem key={value} value={value}>
                  <span className='min-w-0 truncate'>{label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}
