import type { JSONPath } from 'jsonc-parser';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { ConfigDocumentState, ConfigDocumentStore } from '@entities/Config';
import { toFieldPlan } from '@shared/lib/schemaShape';
import { useWriteOnChange } from '@shared/lib/useWriteOnChange';

import {
  arrangePlan,
  isSameValue,
  splitFieldsSinceOpen,
  toFieldName,
  toNodeFormResolver,
  writeNodeForm,
  type ConfigNodeFormModel,
  type NodeOverride,
} from '../model';
import { RAW_PARSE_ERROR, RawFailuresContext } from './ConfigNodeForm.context';
import { ConfigNodeFormAdvancedFields } from './ConfigNodeFormAdvancedFields';
import { ConfigNodeFormNodeField } from './ConfigNodeFormNodeField';

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
  const editMany = ConfigDocumentState.use.editMany();
  const revision = ConfigDocumentState.use.revision();
  const layout = useMemo(() => arrangePlan(toFieldPlan(schema), override), [schema, override]);
  const [openedNode] = useState(node);
  const resolver = useMemo(() => toNodeFormResolver(schema, override), [schema, override]);
  const [failures] = useState(() => new Map<string, unknown>());
  // Dirty state is rebased when focus leaves the form: a field changed since opening keeps its place by this set.
  const [changed] = useState(() => new Set<string>());
  // RHF retains prototype-less parsed objects by reference; clone them so field edits do not mutate the baseline.
  const values = useMemo(() => structuredClone(node), [node]);

  const form = useForm<ConfigNodeFormModel, ConfigNodeFormModel>({
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
    mode: 'onChange',
    shouldFocusError: false,
    // Node before the edit: override checks do not recheck the untouched.
    context: node,
    resolver,
  });

  useEffect(
    function rememberChangedFields() {
      const subscription = form.watch(function rememberChange(_values, { name, type }) {
        if (type === 'change' && name !== undefined) changed.add(name);
      });

      return function forgetChangedFields() {
        subscription.unsubscribe();
      };
    },
    [form, changed]
  );

  const rest = splitFieldsSinceOpen(
    layout.rest,
    openedNode,
    node,
    (field) =>
      changed.has(toFieldName(field.path)) || form.getFieldState(toFieldName(field.path), form.formState).isDirty
  );

  const formRef = useWriteOnChange(
    form,
    (_output, withRemovals) => {
      // The resolver does not see unparsed raw field JSON: the field value is the previous one.
      const unparsed = [...failures].filter(([name, value]) => isSameValue(form.getValues(name), value));

      for (const [name] of unparsed) {
        form.setError(name, { type: RAW_PARSE_ERROR });
      }

      return unparsed.length === 0 && writeNodeForm(editMany, path, node, form.getValues(), withRemovals);
    },
    () => ConfigDocumentStore.getState().revision !== revision
  );

  return (
    <FormProvider {...form}>
      <RawFailuresContext value={failures}>
        <form
          ref={formRef}
          noValidate
          // A port or a timeout stretched over a wide screen reads as a long value.
          className='flex max-w-3xl flex-col gap-5'
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          {layout.primary.map((field) => (
            <ConfigNodeFormNodeField key={field.key} field={field} builtTags={builtTags} />
          ))}

          {rest.filled.map((field) => (
            <ConfigNodeFormNodeField key={field.key} field={field} builtTags={builtTags} />
          ))}

          {rest.empty.length > 0 && (
            <ConfigNodeFormAdvancedFields names={rest.empty.map((field) => toFieldName(field.path))}>
              {rest.empty.map((field) => (
                <ConfigNodeFormNodeField key={field.key} field={field} builtTags={builtTags} />
              ))}
            </ConfigNodeFormAdvancedFields>
          )}
        </form>
      </RawFailuresContext>
    </FormProvider>
  );
}
