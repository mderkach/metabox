import { fingerprint } from '@shared/lib/fingerprint';

import type { ConfigDocumentState } from './Config.store';

/** List file changes ready to go in the apply envelope. */
export interface ListChanges {
  put: Record<string, string>;
  remove: string[];
}

export function selectConfigCurrent({ draft, applied }: ConfigDocumentState): string | null {
  return draft ?? applied;
}

export function selectConfigDirty(state: ConfigDocumentState): boolean {
  const { draft, applied } = state;
  const lists = selectListChanges(state);

  return (draft !== null && draft !== applied) || Object.keys(lists.put).length > 0 || lists.remove.length > 0;
}

/**
 * The device file is in the store, and so are the list files when the draft
 * changes any: a draft restored after a reload has no Apply base before that.
 */
export function selectConfigLoaded({ applied, appliedLists, listsDraft }: ConfigDocumentState): boolean {
  return applied !== null && (appliedLists !== null || Object.keys(listsDraft).length === 0);
}

/** The device config changed since the draft was started. */
export function selectConfigStale({ draft, draftBase, applied }: ConfigDocumentState): boolean {
  return (
    draft !== null && draftBase !== null && applied !== null && draft !== applied && draftBase !== fingerprint(applied)
  );
}

/** Omits unchanged writes and deletions of files absent from the device. */
export function selectListChanges({
  listsDraft,
  appliedLists,
}: Pick<ConfigDocumentState, 'listsDraft' | 'appliedLists'>): ListChanges {
  const current = appliedLists ?? {};
  const changes: ListChanges = { put: {}, remove: [] };

  for (const [name, content] of Object.entries(listsDraft)) {
    if (content === null) {
      if (name in current) changes.remove.push(name);

      continue;
    }

    if (current[name] !== content) changes.put[name] = content;
  }

  return changes;
}
