import type { JSONPath } from 'jsonc-parser';
import { useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { ConfigDocumentState, diffNode, nodeSchemaOf, type NodeRegistry } from '@entities/Config';
import { toFieldPlan, type FieldPlan } from '@shared/lib/schemaShape';
import { Button } from '@shared/ui';

import { isSameValue, toFieldName, toNodeFormResolver, type ConfigNodeFormModel } from '../model';
import { RAW_PARSE_ERROR, RawFailuresContext } from './ConfigNodeForm.context';
import { CONFIG_NODE_FORM_WIDGET } from './ConfigNodeForm.widgets';

/**
 * Форма узла секции, нарисованная по схеме его типа (ADR-0035).
 *
 * В черновик уходят только изменённые листья узла: правка одного поля даёт
 * одну строку дифа, а комментарии и порядок ключей внутри узла остаются как
 * были. Узел, которого схема его типа не знает, формы не получает — его
 * открывает текстовый режим (ADR-0018).
 */
export function ConfigNodeForm({
  registry,
  path,
  node,
}: {
  registry: NodeRegistry;
  path: JSONPath;
  node: ConfigNodeFormModel;
}) {
  const type = node.type;
  const schema = useMemo(() => (typeof type === 'string' ? nodeSchemaOf(registry, type) : null), [registry, type]);

  if (schema === null) {
    return null;
  }

  return <ConfigNodeFormBody schema={schema} path={path} node={node} />;
}

function ConfigNodeFormBody({
  schema,
  path,
  node,
}: {
  schema: z.core.$ZodType;
  path: JSONPath;
  node: ConfigNodeFormModel;
}) {
  const { t } = useTranslation('shared');
  const editMany = ConfigDocumentState.use.editMany();
  const plan = useMemo(() => toFieldPlan(schema), [schema]);
  const resolver = useMemo(() => toNodeFormResolver(schema), [schema]);
  const [failures] = useState(() => new Map<string, unknown>());
  // Узел из разбора текста — объекты без прототипа: RHF такие не копирует, и
  // правка поля переписала бы заодно и исходные значения — форма не узнала бы,
  // что её тронули. Копия даёт обычные объекты с теми же значениями.
  const values = useMemo(() => structuredClone(node), [node]);

  const form = useForm<ConfigNodeFormModel>({
    // Значения — узел как есть: дефолт, дописанный формой, попал бы в диф
    // правкой, которой пользователь не делал. `values` подтягивает правку того
    // же узла текстом, `keepDirtyValues` не стирает набранное.
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
    mode: 'onChange',
    resolver,
  });

  const onSubmit = form.handleSubmit(() => {
    // Неразобранный JSON raw-поля резолвер не видит: значение у поля прежнее.
    const unparsed = [...failures].filter(([name, value]) => isSameValue(form.getValues(name), value));

    if (unparsed.length > 0) {
      for (const [name] of unparsed) {
        form.setError(name, { type: RAW_PARSE_ERROR }, { shouldFocus: true });
      }

      return;
    }

    const data = form.getValues();

    editMany(diffNode(path, node, data));
    // Сохранённое становится новой точкой отсчёта: кнопка гаснет, пока форма
    // снова не разойдётся с черновиком.
    form.reset(data);
  });

  return (
    <FormProvider {...form}>
      <RawFailuresContext value={failures}>
        <form
          noValidate
          className='flex flex-col gap-3'
          onSubmit={(event) => {
            void onSubmit(event);
          }}
        >
          {plan.map((field) => (
            <NodeField key={field.key} field={field} />
          ))}

          <Button type='submit' size='sm' disabled={!form.formState.isDirty} className='self-start'>
            {t('nodeEditor.submit')}
          </Button>
        </form>
      </RawFailuresContext>
    </FormProvider>
  );
}

/** Поле по его виду: виджет из таблицы, группа — со своими полями внутри. */
function NodeField({ field }: { field: FieldPlan }) {
  const Widget = CONFIG_NODE_FORM_WIDGET[field.kind];

  if (Widget === null) {
    return null;
  }

  return (
    <Widget field={field} name={toFieldName(field.path)}>
      {field.children?.map((child) => (
        <NodeField key={child.key} field={child} />
      ))}
    </Widget>
  );
}
