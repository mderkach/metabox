import { zodResolver } from '@hookform/resolvers/zod';
import { get, set, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { compactNode } from '@entities/Config';
import type { FieldPlan } from '@shared/lib/schemaShape';

import { overrideIssues, type NodeOverride } from './ConfigNodeForm.overrides';

/**
 * Node form model: keys are the node fields as is. The autorenderer form is
 * typed against any node, not one type: the field path is a string from the
 * schema, and `Path<…>` of this model is simply `string`.
 */
export type ConfigNodeFormModel = Record<string, unknown>;

/**
 * A cleared field. Not `undefined`: React Hook Form reads it as "take the
 * default value" and returns the original into the field. The key deletes the
 * entry in the document (`compactNode`).
 */
export const UNSET = null;

/** A field without a value: cleared or not set in the node. */
export function isUnset(value: unknown): value is null | undefined {
  return value === UNSET || value === undefined;
}

/** Line break in a multiline field: list values go one per line. */
const LINE_BREAK = /\r?\n/;

/** An entry of digits only: a "string or number" field serves it as a number. */
const DIGITS = /^\d+$/;

/**
 * Node form schema: an object with string keys and its type schema at once. The
 * intersection gives the resolver an input object that the registry's base
 * `$ZodType` by type does not carry, without casting; the type schema remarks
 * arrive with the same paths and codes.
 */
function toNodeFormSchema(schema: z.core.$ZodType) {
  return z.intersection(z.record(z.string(), z.unknown()), schema);
}

/**
 * Node form resolver. What is checked is what will go into the document:
 * cleared fields drop out before the check, since an empty duration means "no
 * key", not a string that fails the pattern.
 *
 * On top of the type schema are its override checks: required fields and
 * `refine`. The resolver gets the node before the edit through the form
 * context. A schema remark on the same field stays first: it is more precise.
 */
export function toNodeFormResolver(
  schema: z.core.$ZodType,
  override: NodeOverride | null = null
): Resolver<ConfigNodeFormModel, ConfigNodeFormModel> {
  const resolve = zodResolver(toNodeFormSchema(schema));

  return async function resolveNode(values, context, options) {
    const compacted = compactNode(values);
    const node = isRecord(compacted) ? compacted : {};
    const result = await resolve(node, context, options);
    const issues = overrideIssues(override, node, context ?? {});

    if (issues.length === 0) {
      return result;
    }

    const errors = { ...result.errors };

    for (const { name, code } of issues) {
      if (get(errors, name) === undefined) {
        set(errors, name, { type: code, message: code });
      }
    }

    return { values: {}, errors };
  };
}

function isRecord(value: unknown): value is ConfigNodeFormModel {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Form field name: a dotted path from the node root, and RHF understands only that. */
export function toFieldName(path: readonly string[]): string {
  return path.join('.');
}

/**
 * List values as the form serves them. Empty means no key; a single value of a
 * listable field is a string, not a one-element array: this is how the fork
 * writes it, and an untouched string in the file does not turn into a list.
 */
export function packList(items: readonly string[], listable: boolean): string | string[] | null {
  if (items.length === 0) {
    return UNSET;
  }

  return listable && items.length === 1 ? items[0] : [...items];
}

/** List values from a node: a listable string is one element, the rest is dropped. */
export function unpackList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value === '' ? [] : [value];
  }

  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** Multiline field into list values: empty lines and surrounding spaces drop out. */
export function textToList(text: string, listable: boolean): string | string[] | null {
  return packList(
    text
      .split(LINE_BREAK)
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    listable
  );
}

export function listToText(value: unknown): string {
  return unpackList(value).join('\n');
}

/** A "string or number" field (`routing_mark`): an entry of digits only is a number. */
export function parseScalar(text: string): string | number | null {
  const trimmed = text.trim();

  if (trimmed === '') {
    return UNSET;
  }

  return DIGITS.test(trimmed) ? Number(trimmed) : trimmed;
}

/** Numeric field: empty means no key. */
export function parseNumber(text: string): number | null {
  return text === '' ? UNSET : Number(text);
}

/** Input field value: a string and a number are shown as is, anything else is empty. */
export function toInputText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value === 'number' ? String(value) : '';
}

/**
 * Whether field values are equal as JSON. The form copies values on every
 * reset, so a comparison by reference would see a change where there is none.
 */
export function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** A group in which something is set: such a one opens right away. */
export function isFilledGroup(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

/** Form fields with an override: the main ones on top, the rest under a disclosure. */
export interface NodeFormLayout {
  primary: FieldPlan[];
  rest: FieldPlan[];
}

function findField(plan: readonly FieldPlan[], name: string): FieldPlan | null {
  for (const field of plan) {
    const fieldName = toFieldName(field.path);

    if (fieldName === name) {
      return field;
    }

    if (field.children !== undefined && name.startsWith(`${fieldName}.`)) {
      return findField(field.children, name);
    }
  }

  return null;
}

/** Plan without the `names` fields; a group with nothing left drops out entirely. */
function withoutFields(plan: readonly FieldPlan[], names: ReadonlySet<string>): FieldPlan[] {
  return plan.flatMap((field) => {
    if (names.has(toFieldName(field.path))) {
      return [];
    }

    if (field.children === undefined) {
      return [field];
    }

    const children = withoutFields(field.children, names);

    return children.length === 0 ? [] : [{ ...field, children }];
  });
}

/** Field kind that an override replaces: the rest is as in the schema. */
function withWidgets(plan: readonly FieldPlan[], widgets: NonNullable<NodeOverride['widgets']>): FieldPlan[] {
  return plan.map((field) => {
    const widget = widgets[toFieldName(field.path)];

    if (widget !== undefined) {
      return { ...field, kind: widget.kind, options: widget.options };
    }

    return field.children === undefined ? field : { ...field, children: withWidgets(field.children, widgets) };
  });
}

/**
 * Form layout by override: main fields in its order and the rest. A nested main
 * field is lifted to the top and labeled with its full path
 * (`tls.server_name`), and leaves its group: one field, one control. Without an
 * override there are no main fields, and the form follows the schema as is.
 */
export function arrangePlan(plan: readonly FieldPlan[], override: NodeOverride | null): NodeFormLayout {
  if (override === null) {
    return { primary: [], rest: [...plan] };
  }

  const fields = override.widgets === undefined ? plan : withWidgets(plan, override.widgets);
  const primary = override.primary.flatMap((name) => {
    const field = findField(fields, name);

    return field === null ? [] : [{ ...field, key: name }];
  });

  return { primary, rest: withoutFields(fields, new Set(override.primary)) };
}

/**
 * Splits fields into those set in the node and empty ones. A set field is
 * visible at once: collapsed, it would hide what is already configured in the
 * node. Empty ones go under a disclosure, since a type has dozens of them, and
 * as a wall they would push the set ones away.
 */
export function splitByPresence(
  fields: readonly FieldPlan[],
  node: ConfigNodeFormModel
): { filled: FieldPlan[]; empty: FieldPlan[] } {
  const filled: FieldPlan[] = [];
  const empty: FieldPlan[] = [];

  for (const field of fields) {
    (isUnset(get(node, toFieldName(field.path))) ? empty : filled).push(field);
  }

  return { filled, empty };
}
