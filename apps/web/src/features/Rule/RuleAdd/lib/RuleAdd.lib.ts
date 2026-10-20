import { useCallback } from 'react';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';

/**
 * Inserts a new rule at its number, from one. The array may be absent from the
 * file, and the insert creates it.
 */
export function useCreateRule(): (index: number, node: Record<string, unknown>) => void {
  const insert = ConfigDocumentState.use.insert();

  return useCallback(
    (index: number, node: Record<string, unknown>) => {
      insert(ruleNodePath(index), node);
    },
    [insert]
  );
}
