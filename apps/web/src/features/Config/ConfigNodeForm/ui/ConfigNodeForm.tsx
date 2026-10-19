import type { JSONPath } from 'jsonc-parser';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import {
  ConfigDocumentState,
  diffNode,
  findValue,
  nodeSchemaOf,
  unbuiltOptionOf,
  type NodeRegistry,
} from '@entities/Config';
import { isTextEntryFocused } from '@shared/lib/focus';
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
 * A valid change goes into the draft at once, there is no save step. Only the
 * changed node leaves go into the draft: editing one field gives one diff
 * line, while comments and key order inside the node stay as they were. A
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
  const editMany = ConfigDocumentState.use.editMany();
  const layout = useMemo(() => arrangePlan(toFieldPlan(schema), override), [schema, override]);
  const [openedNode] = useState(node);
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
    // A write follows every keystroke: focus must stay in the field being
    // typed, not jump to another field with an error.
    shouldFocusError: false,
    // Node before the edit: override checks do not recheck the untouched.
    context: node,
    resolver,
  });

  // A field filled when the form opened stays in place: the form writes on
  // every change, and a field cleared while typing would otherwise jump under
  // the disclosure mid-keystroke, as would an empty field the user starts
  // filling there. A field filled from outside, by the node text, comes out.
  const opened = splitByPresence(layout.rest, openedNode);
  const filledNow = new Set(splitByPresence(layout.rest, node).filled);
  const filledFromOutside = (field: FieldPlan) =>
    filledNow.has(field) && !form.getFieldState(toFieldName(field.path), form.formState).isDirty;
  const rest = {
    filled: layout.rest.filter((field) => opened.filled.includes(field) || filledFromOutside(field)),
    empty: opened.empty.filter((field) => !filledFromOutside(field)),
  };

  // The path and the node change identity on every draft parse: the write
  // reads them from here, so the change subscription is not recreated after
  // each keystroke.
  const latest = useRef({ path, node });

  useEffect(function rememberLatestNode() {
    latest.current = { path, node };
  });

  // An emptied field is removed from the node when it is left, not at the
  // first erased character: removing the key and adding it back with the next
  // typed one would move it to the end of the node, and the diff would show
  // the whole node instead of one line.
  const removalPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const write = useCallback(
    async (withRemovals: boolean) =>
      form.handleSubmit(() => {
        // The resolver does not see unparsed raw field JSON: the field value is the previous one.
        const unparsed = [...failures].filter(([name, value]) => isSameValue(form.getValues(name), value));

        if (unparsed.length > 0) {
          for (const [name] of unparsed) {
            form.setError(name, { type: RAW_PARSE_ERROR });
          }

          return;
        }

        const target = latest.current;
        // The node is read from the store text, not taken from props: the
        // parsed document lags the text by a frame, and a value typed and
        // erased back within it would stay in the draft. Only the form keys
        // are compared: a section form holds the section without its lists,
        // and the lists missing from it must not read as deleted. A missing
        // node is written as new: an object section absent from the file is
        // created by its first edit.
        const current = findValue(ConfigDocumentState.getState().current() ?? '', target.path) ?? {};
        const data = form.getValues();

        if (!isRecord(current)) {
          return;
        }

        const edits = diffNode(target.path, pickKeys(current, Object.keys({ ...target.node, ...data })), data);
        const written = withRemovals ? edits : edits.filter((item) => item.value !== undefined);

        removalPending.current = written.length < edits.length;
        editMany(written);
      })(),
    [form, failures, editMany]
  );

  useEffect(
    function writeOnChange() {
      const revision = ConfigDocumentState.getState().revision;

      // Only a user change is written. A reset from `values` sets the
      // untouched fields one by one with `setValue`, and a write in the middle
      // of it would put half-reset values over an edit that came from outside.
      const subscription = form.watch((_values, { type }) => {
        if (type === 'change') {
          void write(!isTextEntryFocused());
        }
      });

      // Leaving a field writes only a held-back removal: an unconditional
      // write here would resolve after the next change and take it too.
      const element = formRef.current;
      const writeHeldBack = () => {
        if (removalPending.current) {
          void write(true);
        }
      };

      element?.addEventListener('focusout', writeHeldBack);

      return function stopWritingOnChange() {
        subscription.unsubscribe();
        element?.removeEventListener('focusout', writeHeldBack);

        // A document replaced from outside (a discarded draft) is not written
        // over: the form would bring back what was just discarded.
        if (removalPending.current && ConfigDocumentState.getState().revision === revision) {
          void write(true);
        }
      };
    },
    [form, write]
  );

  return (
    <FormProvider {...form}>
      <RawFailuresContext value={failures}>
        <form
          ref={formRef}
          noValidate
          className='flex flex-col gap-3'
          onSubmit={(event) => {
            event.preventDefault();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}
