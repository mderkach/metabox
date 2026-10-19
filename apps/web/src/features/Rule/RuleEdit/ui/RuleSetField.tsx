import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import type { RuleEditModel } from '../model/RuleEdit.schema';

/** A tag missing from the document stays selected and marked: only `sing-box check` may reject it. */
export function RuleSetField({ ruleSets, initial }: { ruleSets: string[]; initial: string[] }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control, watch } = useFormContext<RuleEditModel>();
  const value = watch('ruleSet');
  const known = new Set(ruleSets);
  const options = [...new Set([...ruleSets, ...initial, ...value])];

  return (
    <Controller
      control={control}
      name='ruleSet'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='rule-rule-set'>{t('field.ruleSet.label')}</Label>
          <Select multiple value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id='rule-rule-set' className='w-full'>
              {/* In `multiple` mode the value is a list: the label is built
                  by a function, `placeholder` will not replace it. */}
              <SelectValue className='min-w-0'>
                {(tags: readonly string[]) => (
                  <span className='truncate'>{tags.length > 0 ? tags.join(', ') : t('field.ruleSet.empty')}</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                  {!known.has(tag) && <span className='text-muted-foreground'>{t('field.ruleSet.missing')}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}
