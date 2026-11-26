import { useMemo } from 'react';

import { diffLines, type DiffLine } from '@shared/lib/diff';
import { useStore } from '@shared/lib/state';

import { maskConfigPreviewLines } from './Config.preview';
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

export function useConfigDiff({ maskCredentials = false } = {}): DiffLine[] {
  const { applied, draft } = useStore(ConfigDocumentStore, (state) => ({
    applied: state.applied,
    draft: state.draft,
  }));

  return useMemo(() => {
    if (applied === null || draft === null) return [];

    const lines = diffLines(applied, draft);
    if (!maskCredentials) return lines;

    const appliedMasked = maskConfigPreviewLines(applied);
    const draftMasked = maskConfigPreviewLines(draft);

    return lines.map((line) => {
      const masked = line.after === null ? appliedMasked.get(line.before ?? 0) : draftMasked.get(line.after);
      return masked === undefined ? line : { ...line, text: masked };
    });
  }, [applied, draft, maskCredentials]);
}
