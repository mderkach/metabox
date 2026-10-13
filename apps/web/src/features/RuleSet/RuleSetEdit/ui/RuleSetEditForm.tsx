import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, diffNode, ruleSetNodePath } from '@entities/Config';
import { StringField } from '@features/Config/ConfigNodeForm/@x/RuleSetEdit';
import { ExtraFields, FormatField, TagField, type RuleSetAddModel } from '@features/RuleSet/RuleSetAdd/@x/RuleSetEdit';
import { FIELD_KIND, type FieldPlan } from '@shared/lib/schemaShape';
import { Button } from '@shared/ui';

import {
  makeRuleSetEditSchema,
  ruleSetEditDefaults,
  toRuleSetEditNode,
  type RuleSetEditModel,
} from '../model/RuleSetEdit.schema';

const URL_FIELD: FieldPlan = { key: 'url', path: ['url'], kind: FIELD_KIND.String };

/**
 * Editing an existing `remote` set: tag, address, format, interval and download
 * node, with the same fields and checks as when adding.
 *
 * Only changed node fields go into the draft (`diffNode`): editing one field is
 * one diff line. The address is shown by the node form field: everything after
 * the host is hidden until revealed with a button, and the full address goes
 * into the draft.
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
  const defaults = ruleSetEditDefaults(node);

  const form = useForm<RuleSetEditModel, unknown, RuleSetAddModel>({
    defaultValues: defaults,
    mode: 'onTouched',
    resolver: zodResolver(makeRuleSetEditSchema(takenTags, outbounds, defaults.tag)),
  });

  const onSubmit = form.handleSubmit((data) => {
    editMany(diffNode(ruleSetNodePath(index), node, toRuleSetEditNode(node, data)));
    onDone();
  });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <StringField field={URL_FIELD} name={URL_FIELD.key} />
        <TagField />
        <EditFormatField />
        <ExtraFields outbounds={outbounds} />

        <div className='flex flex-wrap items-center gap-2'>
          <Button type='submit' disabled={!form.formState.isDirty}>
            {t('nodeEditor.submit')}
          </Button>
          <Button type='button' variant='ghost' onClick={onDone}>
            {t('action.cancel')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

/**
 * The format field of the add form reads the address as a string; a cleared
 * address is `null` here, and a format without an address is not needed there
 * either.
 */
function EditFormatField() {
  const { control } = useFormContext<RuleSetEditModel>();
  const url = useWatch({ control, name: 'url' });

  return url === null ? null : <FormatField />;
}
