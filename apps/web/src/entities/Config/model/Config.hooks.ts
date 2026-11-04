import { useMemo } from 'react';

import { diffLines, type DiffLine } from '@shared/lib/diff';
import { useStore } from '@shared/lib/state';

import {
  selectConfigCurrent,
  selectConfigDirty,
  selectConfigStale,
  selectListChanges,
  type ListChanges,
} from './Config.selectors';
import { ConfigDocumentStore } from './Config.store';

export function useConfigCurrent(): string | null {
  return useStore(ConfigDocumentStore, selectConfigCurrent);
}

export function useConfigDirty(): boolean {
  return useStore(ConfigDocumentStore, selectConfigDirty);
}

export function useConfigStale(): boolean {
  return useStore(ConfigDocumentStore, selectConfigStale);
}

export function useListChanges(): ListChanges {
  const { listsDraft, appliedLists } = useStore(ConfigDocumentStore, (state) => ({
    listsDraft: state.listsDraft,
    appliedLists: state.appliedLists,
  }));

  return useMemo(() => selectListChanges({ listsDraft, appliedLists }), [listsDraft, appliedLists]);
}

export function useConfigDiff(): DiffLine[] {
  const { applied, draft } = useStore(ConfigDocumentStore, (state) => ({
    applied: state.applied,
    draft: state.draft,
  }));

  return useMemo(() => (applied === null || draft === null ? [] : diffLines(applied, draft)), [applied, draft]);
}
