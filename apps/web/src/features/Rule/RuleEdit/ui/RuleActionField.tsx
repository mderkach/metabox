import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { RULE_ACTION, type RuleEditModel } from '../model/RuleEdit.schema';

export function RuleActionField() {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control } = useFormContext<RuleEditModel>();

  return (
    <Controller
      control={control}
      name='action'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='rule-action'>{t('field.action.label')}</Label>
          <Select
            items={Object.values(RULE_ACTION).map((action) => ({ value: action, label: t(`action.${action}`) }))}
            value={field.value}
            onValueChange={field.onChange}
          >
            <SelectTrigger id='rule-action'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(RULE_ACTION).map((action) => (
                <SelectItem key={action} value={action}>
                  {t(`action.${action}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}
