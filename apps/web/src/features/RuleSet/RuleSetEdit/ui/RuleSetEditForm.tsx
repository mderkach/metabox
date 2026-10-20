import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ConfigDocumentStore } from '@entities/Config';
import { StringField } from '@features/Config/ConfigNodeForm/@x/RuleSetEdit';
import { ExtraFields, TagField, type RuleSetAddModel } from '@features/RuleSet/RuleSetAdd/@x/RuleSetEdit';
import { FIELD_KIND, type FieldPlan } from '@shared/lib/schemaShape';
import { useWriteOnChange } from '@shared/lib/useWriteOnChange';
import { Button } from '@shared/ui';

import { writeRuleSetEdit } from '../model/RuleSetEdit.draft';
import { makeRuleSetEditSchema, ruleSetEditDefaults, type RuleSetEditModel } from '../model/RuleSetEdit.schema';
import { RuleSetEditFormatField } from './RuleSetEditFormatField';

const URL_FIELD: FieldPlan = { key: 'url', path: ['url'], kind: FIELD_KIND.String };

/**
 * Editing an existing `remote` set with the same fields and checks as when
 * adding. A valid change goes into the draft at once, one diff line per edited
 * field. The address field hides everything after the host until revealed,
 * and the full address goes into the draft.
 */
export function RuleSetEditForm({
  index,
  node,
  takenTags,
  outbounds,
  onDone,
}: {
  /** Node position in `route.rule_set`. */
  index: number;
  node: Readonly<Record<string, unknown>>;
  takenTags: readonly string[];
  /** Document outbound tags; an empty list means the config is not parsed. */
  outbounds: readonly string[];
  onDone: () => void;
}) {
  const { t } = useTranslation('shared');
  const editMany = ConfigDocumentState.use.editMany();
  const revision = ConfigDocumentState.use.revision();
  const defaults = ruleSetEditDefaults(node);

  const form = useForm<RuleSetEditModel, unknown, RuleSetAddModel>({
    defaultValues: defaults,
    mode: 'onChange',
    shouldFocusError: false,
    resolver: zodResolver(makeRuleSetEditSchema(takenTags, outbounds, defaults.tag)),
  });

  const formRef = useWriteOnChange(
    form,
    (data, withRemovals) => writeRuleSetEdit(editMany, index, data, withRemovals),
    () => ConfigDocumentStore.getState().revision !== revision
  );

  return (
    <FormProvider {...form}>
      <form
        ref={formRef}
        noValidate
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <StringField field={URL_FIELD} name={URL_FIELD.key} />
        <TagField />
        <RuleSetEditFormatField />
        <ExtraFields outbounds={outbounds} />

        <Button type='button' variant='outline' className='self-start' onClick={onDone}>
          {t('action.done')}
        </Button>
      </form>
    </FormProvider>
  );
}
