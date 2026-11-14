import type { JSONPath } from 'jsonc-parser';
import { get, set } from 'react-hook-form';

import {
  compactNode,
  selectConfigCurrent,
  ConfigDocumentStore,
  diffNode,
  findValue,
  type NodeEdit,
} from '@entities/Config';
import { BOOLEAN_GROUP_FLAG, FIELD_KIND, type FieldPlan } from '@shared/lib/schemaShape';

import { splitByPresence, toFieldName, UNSET, type ConfigNodeFormModel } from './ConfigNodeForm.model';

/**
 * Writes the changed leaves of the node against the draft text right now:
 * the parsed document lags the text by a frame. Only keys of the form are
 * compared, since a section form holds the section without its lists. A node
 * missing from the file is created by its first edit. Returns whether a
 * removal was held back because `withRemovals` is off.
 */
export function writeNodeForm(
  editMany: (edits: readonly NodeEdit[]) => void,
  path: JSONPath,
  plan: readonly FieldPlan[],
  node: ConfigNodeFormModel,
  data: ConfigNodeFormModel,
  withRemovals: boolean
): boolean {
  const current = findValue(selectConfigCurrent(ConfigDocumentStore.getState()) ?? '', path) ?? {};

  if (!isRecord(current)) {
    return false;
  }

  const edits = diffNode(
    path,
    pickKeys(current, Object.keys({ ...node, ...data })),
    packBooleanGroups(plan, current, data)
  );
  const written = withRemovals ? edits : edits.filter((item) => item.value !== undefined);

  editMany(written);

  return written.length < edits.length;
}

/**
 * Filled and empty fields, the empty ones going under the disclosure. A field
 * filled at opening stays put, so a field cleared or started while typing does
 * not jump between the lists; a field filled from outside comes out.
 */
export function splitFieldsSinceOpen(
  fields: readonly FieldPlan[],
  opened: ConfigNodeFormModel,
  node: ConfigNodeFormModel,
  isTouched: (field: FieldPlan) => boolean
): { filled: FieldPlan[]; empty: FieldPlan[] } {
  const atOpen = splitByPresence(fields, opened);
  const filledNow = new Set(splitByPresence(fields, node).filled);
  const fromOutside = (field: FieldPlan) => filledNow.has(field) && !isTouched(field);

  return {
    filled: fields.filter((field) => atOpen.filled.includes(field) || fromOutside(field)),
    empty: atOpen.empty.filter((field) => !fromOutside(field)),
  };
}

function booleanGroupNames(plan: readonly FieldPlan[]): string[] {
  return plan.flatMap((field) => {
    if (field.kind === FIELD_KIND.BooleanGroup) {
      return [toFieldName(field.path)];
    }

    return booleanGroupNames(field.children ?? []);
  });
}

/**
 * Flag-or-object fields as they go into the document. The form holds the
 * object form while the details are open; an object with nothing set but its
 * flag is written as the flag while the document holds a flag or nothing, so
 * opening the details changes nothing and clearing every detail returns
 * `true`. Over an object in the document the object stays and is compared by
 * keys: its comments survive.
 */
export function packBooleanGroups(
  plan: readonly FieldPlan[],
  before: ConfigNodeFormModel,
  data: ConfigNodeFormModel
): ConfigNodeFormModel {
  const packed = structuredClone(data);

  for (const name of booleanGroupNames(plan)) {
    const value = compactNode(get(packed, name));

    if (
      isRecord(value) &&
      !isRecord(get(before, name)) &&
      Object.keys(value).every((key) => key === BOOLEAN_GROUP_FLAG)
    ) {
      set(packed, name, value[BOOLEAN_GROUP_FLAG] ?? UNSET);
    }
  }

  return packed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}
