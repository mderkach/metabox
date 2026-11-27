import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  ConfigDocumentState,
  ConfigDocumentStore,
  readRuleSets,
  RULE_SETS_PATH,
  selectConfigCurrent,
} from '@entities/Config';
import { type RuleSetCatalog } from '@entities/RuleSet';
import { showQueryError } from '@shared/api';
import { SHARED_NS } from '@shared/i18n';
import { Button } from '@shared/ui';

import { RULE_SET_REMOTE_FORM_NS } from '../i18n/RuleSetRemoteForm.namespace.generated';
import {
  makeRuleSetRemoteFormSchema,
  ruleSetAddDefaults,
  toRuleSetPatch,
  type RuleSetRemoteFormModel,
} from '../model/RuleSetRemoteForm.schema';
import { RuleSetAddAddressField } from './RuleSetAddAddressField';
import { RuleSetAddCategoryField } from './RuleSetAddCategoryField';
import { RuleSetAddKindField } from './RuleSetAddKindField';
import { RuleSetAddProviderField } from './RuleSetAddProviderField';
import { RuleSetRemoteExtraFields } from './RuleSetRemoteExtraFields';
import { RuleSetRemoteFormatField } from './RuleSetRemoteFormatField';
import { RuleSetRemoteTagField } from './RuleSetRemoteTagField';

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
  const { t } = useTranslation(RULE_SET_REMOTE_FORM_NS);
  const insert = ConfigDocumentState.use.insert();
  // A form that stays on the screen must report its success: the set goes into
  // the draft, and without a table row nearby that is not visible.
  const [added, setAdded] = useState<string | null>(null);

  const form = useForm<RuleSetRemoteFormModel>({
    defaultValues: ruleSetAddDefaults(catalog),
    mode: 'onTouched',
    resolver: zodResolver(makeRuleSetRemoteFormSchema(takenTags, outbounds)),
  });

  const onSubmit = form.handleSubmit((data) => {
    // The end of the list is read from the draft text: sets without a tag are
    // not in `takenTags`, and counting by them would insert in the middle.
    const end = readRuleSets(selectConfigCurrent(ConfigDocumentStore.getState()) ?? '').length;

    if (!insert([...RULE_SETS_PATH, end], toRuleSetPatch(data))) {
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
        <RuleSetRemoteTagField />
        <RuleSetRemoteFormatField />
        <RuleSetRemoteExtraFields outbounds={outbounds} />

        <div className='flex flex-wrap items-center gap-2'>
          <Button type='submit'>{t('submit')}</Button>
          {onDone !== undefined && (
            <Button type='button' variant='ghost' onClick={onDone}>
              {t('action.cancel', { ns: SHARED_NS })}
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
