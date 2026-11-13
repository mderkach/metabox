import { useCallback } from 'react';

import {
  ConfigDocumentState,
  ConfigDocumentStore,
  selectConfigCurrent,
  useConfigCurrent,
  useConfigLoad,
} from '@entities/Config';

import {
  applyManualChoice,
  planManualChoice,
  toManualChoiceStatus,
  type ManualChoiceStatus,
} from './ProxyManualChoice.model';

/**
 * Manual choice over an automatic group, written into the editor draft. Nothing is
 * applied: the draft goes to the device by the usual Apply. The device file is loaded
 * here because the proxies screen does not load the document by itself.
 */
export function useManualChoice(group: string): { status: ManualChoiceStatus; add: () => boolean } {
  useConfigLoad(true);

  const text = useConfigCurrent();
  const insert = ConfigDocumentState.use.insert();
  const edit = ConfigDocumentState.use.edit();

  const add = useCallback(
    function addManualChoice(): boolean {
      const current = selectConfigCurrent(ConfigDocumentStore.getState()) ?? '';
      const plan = planManualChoice(current, group);

      if (plan === null || applyManualChoice(current, plan) === null || !insert(plan.insertAt, plan.selector)) {
        return false;
      }

      edit(plan.renameAt, plan.renameTo);

      return true;
    },
    [edit, group, insert]
  );

  return { status: toManualChoiceStatus(text, group), add };
}
