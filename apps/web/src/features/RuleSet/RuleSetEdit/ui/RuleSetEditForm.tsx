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
 * Правка существующего `remote` сета: тег, адрес, формат, интервал и узел
 * скачивания — теми же полями и проверками, что при подключении.
 *
 * В черновик уходят только изменённые поля узла (`diffNode`): правка одного
 * поля — одна строка дифа. Адрес показан полем форм узлов: всё после хоста
 * скрыто до раскрытия кнопкой, в черновик уходит полный адрес.
 */
export function RuleSetEditForm({
  index,
  node,
  takenTags,
  outbounds,
  onDone,
}: {
  /** Позиция узла в `route.rule_set`. */
  index: number;
  node: Readonly<Record<string, unknown>>;
  takenTags: readonly string[];
  /** Теги аутбаундов документа; пустой список — конфиг не разобран. */
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
 * Поле формата формы подключения читает адрес строкой; очищенный адрес здесь
 * `null`, а формат без адреса не нужен и там.
 */
function EditFormatField() {
  const { control } = useFormContext<RuleSetEditModel>();
  const url = useWatch({ control, name: 'url' });

  return url === null ? null : <FormatField />;
}
