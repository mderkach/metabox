import type { JSONPath } from 'jsonc-parser';
import { ChevronRight } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { ConfigDocumentState, diffNode, nodeSchemaOf, unbuiltOptionOf, type NodeRegistry } from '@entities/Config';
import { toFieldPlan, type FieldPlan } from '@shared/lib/schemaShape';
import { cn } from '@shared/lib/utils';
import { Badge, Button, FieldLegend, FieldSet } from '@shared/ui';

import {
  arrangePlan,
  isSameValue,
  nodeOverrideOf,
  toFieldName,
  toNodeFormResolver,
  type ConfigNodeFormModel,
  type NodeOverride,
} from '../model';
import { RAW_PARSE_ERROR, RawFailuresContext } from './ConfigNodeForm.context';
import { CONFIG_NODE_FORM_WIDGET } from './ConfigNodeForm.widgets';

const NS = 'features/Config/ConfigNodeForm';

/**
 * Форма узла секции, нарисованная по схеме его типа (ADR-0035).
 *
 * В черновик уходят только изменённые листья узла: правка одного поля даёт
 * одну строку дифа, а комментарии и порядок ключей внутри узла остаются как
 * были. Узел, которого схема его типа не знает, формы не получает — его
 * открывает текстовый режим (ADR-0018).
 *
 * Тип с оверрайдом (`NODE_OVERRIDE`) открывается его основными полями, а
 * остальные уходят под свёртку «Дополнительно»; проверки оверрайда идут
 * поверх схемы. Опция, которой нет в сборке бинаря, помечена у своего поля
 * (`builtTags` — `null`, пока состав сборки не прочитан).
 */
export function ConfigNodeForm({
  registry,
  path,
  node,
  builtTags = null,
}: {
  registry: NodeRegistry;
  path: JSONPath;
  node: ConfigNodeFormModel;
  builtTags?: readonly string[] | null;
}) {
  const type = node.type;
  const schema = useMemo(() => (typeof type === 'string' ? nodeSchemaOf(registry, type) : null), [registry, type]);
  const override = typeof type === 'string' ? nodeOverrideOf(registry, type) : null;

  if (schema === null) {
    return null;
  }

  return <ConfigNodeFormBody schema={schema} override={override} path={path} node={node} builtTags={builtTags} />;
}

function ConfigNodeFormBody({
  schema,
  override,
  path,
  node,
  builtTags,
}: {
  schema: z.core.$ZodType;
  override: NodeOverride | null;
  path: JSONPath;
  node: ConfigNodeFormModel;
  builtTags: readonly string[] | null;
}) {
  const { t } = useTranslation('shared');
  const editMany = ConfigDocumentState.use.editMany();
  const layout = useMemo(() => arrangePlan(toFieldPlan(schema), override), [schema, override]);
  const resolver = useMemo(() => toNodeFormResolver(schema, override), [schema, override]);
  const [failures] = useState(() => new Map<string, unknown>());
  // Узел из разбора текста — объекты без прототипа: RHF такие не копирует, и
  // правка поля переписала бы заодно и исходные значения — форма не узнала бы,
  // что её тронули. Копия даёт обычные объекты с теми же значениями.
  const values = useMemo(() => structuredClone(node), [node]);

  const form = useForm<ConfigNodeFormModel, ConfigNodeFormModel>({
    // Значения — узел как есть: дефолт, дописанный формой, попал бы в диф
    // правкой, которой пользователь не делал. `values` подтягивает правку того
    // же узла текстом, `keepDirtyValues` не стирает набранное.
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
    mode: 'onChange',
    // Узел до правки: проверки оверрайда не перепроверяют нетронутое.
    context: node,
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
          {layout.primary.map((field) => (
            <NodeField key={field.key} field={field} builtTags={builtTags} />
          ))}

          {override === null ? (
            layout.rest.map((field) => <NodeField key={field.key} field={field} builtTags={builtTags} />)
          ) : (
            <AdvancedFields>
              {layout.rest.map((field) => (
                <NodeField key={field.key} field={field} builtTags={builtTags} />
              ))}
            </AdvancedFields>
          )}

          <Button type='submit' size='sm' disabled={!form.formState.isDirty} className='self-start'>
            {t('nodeEditor.submit')}
          </Button>
        </form>
      </RawFailuresContext>
    </FormProvider>
  );
}

/**
 * Поле по его виду: виджет из таблицы, группа — со своими полями внутри.
 * Опция вне сборки бинаря помечается один раз — у самого верхнего поля, к
 * которому она относится; поля внутри помеченной группы пометку не повторяют.
 */
function NodeField({
  field,
  builtTags,
  marked = false,
}: {
  field: FieldPlan;
  builtTags: readonly string[] | null;
  /** Предок поля уже помечен. */
  marked?: boolean;
}) {
  const { t } = useTranslation(NS);
  const Widget = CONFIG_NODE_FORM_WIDGET[field.kind];
  const name = toFieldName(field.path);
  const unbuilt = marked ? null : unbuiltOptionOf(name, builtTags);

  if (Widget === null) {
    return null;
  }

  const widget = (
    <Widget field={field} name={name}>
      {field.children?.map((child) => (
        <NodeField key={child.key} field={child} builtTags={builtTags} marked={marked || unbuilt !== null} />
      ))}
    </Widget>
  );

  return unbuilt === null ? (
    widget
  ) : (
    <div className='flex flex-col gap-1.5'>
      <Badge variant='outline' className='self-start'>
        {t('unbuilt', { tag: unbuilt })}
      </Badge>
      {widget}
    </div>
  );
}

/**
 * Поля типа с оверрайдом, кроме основных. Свёрнуты всегда: основные поля
 * покрывают сценарий типа, а остальные — тонкая настройка, которая иначе
 * отодвигала бы их стеной полей dial. Свёрнутые поля не монтируются, значения
 * формы при этом не теряются.
 */
function AdvancedFields({ children }: { children: ReactNode }) {
  const { t } = useTranslation(NS);
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <FieldSet className='gap-3 rounded-lg border border-border p-3'>
      <FieldLegend variant='label' className='mb-0 px-1'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-expanded={open}
          aria-controls={contentId}
          className='-mx-1 text-xs'
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
          {t('advanced')}
        </Button>
      </FieldLegend>
      <div id={contentId} hidden={!open} className='flex flex-col gap-3'>
        {open && children}
      </div>
    </FieldSet>
  );
}
