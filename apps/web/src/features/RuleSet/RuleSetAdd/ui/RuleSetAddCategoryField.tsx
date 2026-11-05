import { useId } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { filterCategories, type RuleSetCatalog } from '@entities/RuleSet';
import { Autocomplete, Label } from '@shared/ui';

import { listFreshness } from '../lib/RuleSetAdd.freshness';
import { SUGGESTION_LIMIT } from '../model/RuleSetAdd.constants';
import { composeRuleSetTag, composeRuleSetURL, type RuleSetAddModel } from '../model/RuleSetAdd.schema';
import { useSelectedList } from '../model/RuleSetAdd.selection';

/**
 * Provider category. Hints come from the listing the daemon checks, but a name
 * that is not in it is entered in the same field and built into the address by
 * the same template: the provider may have added a category after the check.
 */
export function RuleSetAddCategoryField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const category = useWatch({ control, name: 'category' });
  const list = useSelectedList(catalog);
  const id = useId();
  const hintId = useId();

  if (list === null) {
    return null;
  }

  const suggestions = filterCategories(list, category).slice(0, SUGGESTION_LIMIT);

  const pick = (next: string) => {
    setValue('category', next);
    setValue('url', composeRuleSetURL(list, getValues('mirrorId'), next));
    setValue('tag', composeRuleSetTag(list, next));
  };

  return (
    <Controller
      control={control}
      name='category'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.category.label')}</Label>
          <Autocomplete
            id={id}
            items={suggestions}
            value={field.value}
            onValueChange={pick}
            placeholder={t('field.category.placeholder')}
            autoComplete='off'
            spellCheck={false}
            className='font-mono'
            listClassName='font-mono'
            aria-describedby={hintId}
          />
          <p id={hintId} className='text-xs text-pretty text-muted-foreground'>
            {listFreshness(t, list)} {t('field.category.hint')}
          </p>
        </div>
      )}
    />
  );
}
