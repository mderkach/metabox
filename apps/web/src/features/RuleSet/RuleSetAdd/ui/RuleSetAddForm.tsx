import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, RULE_SETS_PATH } from '@entities/Config';
import { type RuleSetCatalog } from '@entities/RuleSet';
import { showQueryError } from '@shared/api';
import { Button } from '@shared/ui';

import {
  makeRuleSetAddSchema,
  ruleSetAddDefaults,
  toRuleSetPatch,
  type RuleSetAddModel,
} from '../model/RuleSetAdd.schema';
import { RuleSetAddAddressField } from './RuleSetAddAddressField';
import { RuleSetAddCategoryField } from './RuleSetAddCategoryField';
import { RuleSetAddExtraFields } from './RuleSetAddExtraFields';
import { RuleSetAddFormatField } from './RuleSetAddFormatField';
import { RuleSetAddKindField } from './RuleSetAddKindField';
import { RuleSetAddProviderField } from './RuleSetAddProviderField';
import { RuleSetAddTagField } from './RuleSetAddTagField';

/** Adds a catalog set or a manually entered address to the draft. */
export function RuleSetAddForm({
  catalog,
  takenTags,
  outbounds,
  onDone,
}: {
  catalog: RuleSetCatalog;
  takenTags: readonly string[];
  /** Document outbound tags; an empty list means the config is not parsed. */
  outbounds: readonly string[];
  onDone?: () => void;
}) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const insert = ConfigDocumentState.use.insert();
  const count = takenTags.length;
  // A form that stays on the screen must report its success: the set goes into
  // the draft, and without a table row nearby that is not visible.
  const [added, setAdded] = useState<string | null>(null);

  const form = useForm<RuleSetAddModel>({
    defaultValues: ruleSetAddDefaults(catalog),
    mode: 'onTouched',
    resolver: zodResolver(makeRuleSetAddSchema(takenTags, outbounds)),
  });

  const onSubmit = form.handleSubmit((data) => {
    if (!insert([...RULE_SETS_PATH, count], toRuleSetPatch(data))) {
      showQueryError({ showError: true, errorMessageKey: 'toast.config.edit.failed' }, null);

      return;
    }
    form.reset(ruleSetAddDefaults(catalog));
    setAdded(data.tag);
    onDone?.();
  });

  return (
    <FormProvider {...form}>
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <RuleSetAddProviderField catalog={catalog} />
        <RuleSetAddKindField catalog={catalog} />
        <RuleSetAddCategoryField catalog={catalog} />
        <RuleSetAddAddressField catalog={catalog} />
        <RuleSetAddTagField />
        <RuleSetAddFormatField />
        <RuleSetAddExtraFields outbounds={outbounds} />

        <div className='flex flex-wrap items-center gap-2'>
          <Button type='submit'>{t('submit')}</Button>
          {onDone !== undefined && (
            <Button type='button' variant='ghost' onClick={onDone}>
              {t('action.cancel', { ns: 'shared' })}
            </Button>
          )}
        </div>

        {added !== null && onDone === undefined && (
          <p role='status' className='flex items-start gap-1.5 text-xs text-pretty text-signal-ok'>
            <CircleCheck className='mt-px size-3.5 shrink-0' aria-hidden='true' />
            <span>{t('added', { tag: added })}</span>
          </p>
        )}
      </form>
    </FormProvider>
  );
}
