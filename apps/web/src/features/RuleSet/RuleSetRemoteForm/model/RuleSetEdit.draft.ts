import {
  selectConfigCurrent,
  ConfigDocumentStore,
  diffNode,
  findValue,
  ruleSetNodePath,
  type NodeEdit,
} from '@entities/Config';
import { isRecord } from '@shared/lib/isRecord';

import { toRuleSetEditNode } from './RuleSetEdit.schema';
import type { RuleSetRemoteFormModel } from './RuleSetRemoteForm.schema';

/**
 * Writes the changed fields of the set at `index` against the draft text right
 * now: the parsed document lags the text by a frame. Returns whether a removal
 * was held back because `withRemovals` is off.
 */
export function writeRuleSetEdit(
  editMany: (edits: readonly NodeEdit[]) => void,
  index: number,
  data: RuleSetRemoteFormModel,
  withRemovals: boolean
): boolean {
  const path = ruleSetNodePath(index);
  const current = findValue(selectConfigCurrent(ConfigDocumentStore.getState()) ?? '', path);

  if (!isRecord(current)) {
    return false;
  }

  const edits = diffNode(path, current, toRuleSetEditNode(current, data));
  const written = withRemovals ? edits : edits.filter((item) => item.value !== undefined);

  editMany(written);

  return written.length < edits.length;
}
