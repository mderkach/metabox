import type { ParseKeys, TFunction } from 'i18next';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { RULE_ACTION, RULE_EDIT_ERROR, type RuleEditModel } from '../model/RuleEdit.schema';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'features/Rule/RuleEdit'> | undefined>> = {
  [RULE_EDIT_ERROR.OutboundRequired]: 'error.outboundRequired',
};

export function RuleOutboundField({ outbounds }: { outbounds: string[] }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control, watch } = useFormContext<RuleEditModel>();
  const action = watch('action');

  if (action !== RULE_ACTION.Route) {
    return null;
  }

  return (
    <Controller
      control={control}
      name='outbound'
      render={({ field, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='rule-outbound'>{t('field.outbound.label')}</Label>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id='rule-outbound'>
              <SelectValue placeholder={t('field.outbound.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {outbounds.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldState.error !== undefined && (
            <p role='alert' className='text-xs text-destructive'>
              {errorText(t, fieldState.error.message)}
            </p>
          )}
        </div>
      )}
    />
  );
}

function errorText(t: TFunction<'features/Rule/RuleEdit'>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : ERROR_KEY[message];

  return key === undefined ? null : t(key);
}
