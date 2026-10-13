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
  splitByPresence,
  toFieldName,
  toNodeFormResolver,
  type ConfigNodeFormModel,
  type NodeOverride,
} from '../model';
import { RAW_PARSE_ERROR, RawFailuresContext } from './ConfigNodeForm.context';
import { CONFIG_NODE_FORM_WIDGET } from './ConfigNodeForm.widgets';

const NS = 'features/Config/ConfigNodeForm';

/**
 * Section node form drawn from the schema of its type (ADR-0035).
 *
 * Only the changed node leaves go into the draft: editing one field gives one
 * diff line, while comments and key order inside the node stay as they were. A
 * node that the schema of its type does not know gets no form: text mode opens
 * it (ADR-0018).
 *
 * A type with an override (`NODE_OVERRIDE`) opens with its main fields;
 * override checks go on top of the schema. The other fields set in the node
 * follow, and empty ones go under a disclosure. An option that is not in the
 * binary build is marked at its field (`builtTags` is `null` until the build
 * contents are read).
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

export function ConfigNodeFormBody({
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
  const rest = useMemo(() => splitByPresence(layout.rest, node), [layout.rest, node]);
  const resolver = useMemo(() => toNodeFormResolver(schema, override), [schema, override]);
  const [failures] = useState(() => new Map<string, unknown>());
  // A node from text parsing consists of objects without a prototype: RHF does
  // not copy those, and editing a field would rewrite the original values too,
  // so the form would not know it was touched. The copy gives ordinary objects
  // with the same values.
  const values = useMemo(() => structuredClone(node), [node]);

  const form = useForm<ConfigNodeFormModel, ConfigNodeFormModel>({
    // Values are the node as is: a default appended by the form would get into
    // the diff as an edit the user did not make. `values` pulls in an edit of
    // the same node made as text, `keepDirtyValues` does not erase what was
    // typed.
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
    mode: 'onChange',
    // Node before the edit: override checks do not recheck the untouched.
    context: node,
    resolver,
  });

  const onSubmit = form.handleSubmit(() => {
    // The resolver does not see unparsed raw field JSON: the field value is the previous one.
    const unparsed = [...failures].filter(([name, value]) => isSameValue(form.getValues(name), value));

    if (unparsed.length > 0) {
      for (const [name] of unparsed) {
        form.setError(name, { type: RAW_PARSE_ERROR }, { shouldFocus: true });
      }

      return;
    }

    const data = form.getValues();

    editMany(diffNode(path, node, data));
    // Saved becomes the new reference point: the button goes dim until the form
    // diverges from the draft again.
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

          {rest.filled.map((field) => (
            <NodeField key={field.key} field={field} builtTags={builtTags} />
          ))}

          {rest.empty.length > 0 && (
            <AdvancedFields count={rest.empty.length}>
              {rest.empty.map((field) => (
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
 * Field by its kind: a widget from the table, a group with its own fields
 * inside. An option outside the binary build is marked once, at the topmost
 * field it belongs to; fields inside a marked group do not repeat the mark.
 */
function NodeField({
  field,
  builtTags,
  marked = false,
}: {
  field: FieldPlan;
  builtTags: readonly string[] | null;
  /** The field ancestor is already marked. */
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

/** Disclosure of empty fields. Collapsed fields are not mounted, and form values are not lost. */
function AdvancedFields({ count, children }: { count: number; children: ReactNode }) {
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
          {t('advanced', { count })}
        </Button>
      </FieldLegend>
      <div id={contentId} hidden={!open} className='flex flex-col gap-3'>
        {open && children}
      </div>
    </FieldSet>
  );
}
