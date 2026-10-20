import { ConfigDocumentStore, diffNode, findValue, ruleSetNodePath, type NodeEdit } from '@entities/Config';
import type { RuleSetAddModel } from '@features/RuleSet/RuleSetAdd/@x/RuleSetEdit';

import { toRuleSetEditNode } from './RuleSetEdit.schema';

/**
 * Writes the changed fields of the set at `index` against the draft text right
 * now: the parsed document lags the text by a frame. Returns whether a removal
 * was held back because `withRemovals` is off.
 */
export function writeRuleSetEdit(
  editMany: (edits: readonly NodeEdit[]) => void,
  index: number,
  data: RuleSetAddModel,
  withRemovals: boolean
): boolean {
  const path = ruleSetNodePath(index);
  const current = findValue(ConfigDocumentStore.getState().current() ?? '', path);

  if (!isRecord(current)) {
    return false;
  }

  const edits = diffNode(path, current, toRuleSetEditNode(current, data));
  const written = withRemovals ? edits : edits.filter((item) => item.value !== undefined);

  editMany(written);

  return written.length < edits.length;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
