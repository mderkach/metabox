import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { RULE_CONDITIONS, type RuleCondition } from '../model/RuleEdit.schema';
import { RuleConditionField } from './RuleConditionField';

/**
 * Common rule conditions. Set ones are visible; the others are added by choice
 * rather than standing as empty fields: a rule usually has one or two
 * conditions.
 */
export function RuleConditionFields({ initial }: { initial: readonly RuleCondition[] }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const [opened, setOpened] = useState<readonly RuleCondition[]>(initial);
  const shown = RULE_CONDITIONS.filter((key) => initial.includes(key) || opened.includes(key));
  const [added, setAdded] = useState<RuleCondition | null>(null);
  const hidden = RULE_CONDITIONS.filter((key) => !shown.includes(key));
  const addId = useId();

  return (
    <fieldset className='flex min-w-0 flex-col gap-3'>
      <legend className='mb-1.5 text-sm font-medium'>{t('field.conditions.label')}</legend>

      {shown.map((key) => (
        <RuleConditionField key={key} condition={key} focusOnMount={key === added} />
      ))}

      {hidden.length > 0 && (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={addId} className='sr-only'>
            {t('field.conditions.add')}
          </Label>
          <Select
            value={null}
            onValueChange={(key: RuleCondition | null) => {
              if (key !== null) {
                setOpened([...opened, key]);
                setAdded(key);
              }
            }}
          >
            <SelectTrigger id={addId} size='sm' className='self-start'>
              <SelectValue placeholder={t('field.conditions.add')} />
            </SelectTrigger>
            <SelectContent>
              {hidden.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`condition.${key}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </fieldset>
  );
}
