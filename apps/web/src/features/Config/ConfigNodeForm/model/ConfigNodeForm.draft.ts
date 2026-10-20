import type { JSONPath } from 'jsonc-parser';

import { ConfigDocumentStore, diffNode, findValue, type NodeEdit } from '@entities/Config';
import type { FieldPlan } from '@shared/lib/schemaShape';

import { splitByPresence, type ConfigNodeFormModel } from './ConfigNodeForm.model';

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
  node: ConfigNodeFormModel,
  data: ConfigNodeFormModel,
  withRemovals: boolean
): boolean {
  const current = findValue(ConfigDocumentStore.getState().current() ?? '', path) ?? {};

  if (!isRecord(current)) {
    return false;
  }

  const edits = diffNode(path, pickKeys(current, Object.keys({ ...node, ...data })), data);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}
