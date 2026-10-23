import type { JSONPath } from 'jsonc-parser';
import { useEffect, useMemo } from 'react';

import { diffLines, type DiffLine } from '@shared/lib/diff';
import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';

import { insertValue, moveValue, removeValue, setValue } from './Config.model';
import type { NodeEdit } from './Config.patch';
import { readStoredDraft, writeStoredDraft } from './Config.storage';

/** List file changes ready to go in the apply envelope. */
export interface ListChanges {
  put: Record<string, string>;
  remove: string[];
}

export interface ConfigDocumentState {
  /** Text from the device. `null` means the config has not been read yet. */
  applied: string | null;
  /**
   * Fingerprint of `applied` from the daemon response `ETag`; with it the draft
   * goes into the apply `If-Match`. `null` means there was no fingerprint, and
   * the apply goes without a base check.
   */
  appliedEtag: string | null;
  /** User edits on top of `applied`. `null` means there were no edits. */
  draft: string | null;
  /**
   * Text from the device the draft was started from. The draft survives a page
   * reload, and the config on the device may be rewritten meanwhile: applying
   * the draft on top of a new base would silently erase someone else's edits,
   * so the mismatch is shown. `null` means the draft was started before the
   * config was read, or there is none.
   */
  draftBase: string | null;
  /** Files of its own lists from the device: name to content. `null` means not read. */
  appliedLists: Record<string, string> | null;
  /** Fingerprint of the file set from the device; goes into the apply `lists_base`. */
  listsEtag: string | null;
  /** File edits on top of `appliedLists`: name to content, `null` means delete. */
  listsDraft: Record<string, string | null>;
  /**
   * Counter of updates that did not come from the user: loading from the device
   * and discarding edits. The text editor uses it to understand that its
   * content is stale; the user's own edits do not move the counter, otherwise
   * the field would be recreated on every typed character.
   */
  revision: number;
  load: (text: string, etag?: string | null) => void;
  loadLists: (files: Record<string, string>, etag: string | null) => void;
  /** Replaces the whole text: the mode of editing the entire config by hand. */
  replace: (text: string) => void;
  edit: (path: JSONPath, value: unknown) => void;
  /**
   * Several edits in one update: the node form hands over the changed leaves as
   * a batch, and subscribers see one new text, not the intermediate ones.
   */
  editMany: (edits: readonly NodeEdit[]) => void;
  remove: (path: JSONPath) => void;
  insert: (path: JSONPath, value: unknown) => void;
  move: (path: JSONPath, from: number, to: number) => void;
  /** Write a list file into the draft; apply will deliver it in the envelope. */
  editList: (name: string, content: string) => void;
  /** Remove a list file on apply. */
  removeList: (name: string) => void;
  discard: () => void;
  /** Forget both the file and the draft: the panel rereads the config from the device. */
  reset: () => void;
  /** Text the user will see and that goes into Apply. */
  current: () => string | null;
  isDirty: () => boolean;
  /** The config on the device changed since the draft was started. */
  isStale: () => boolean;
  /**
   * File changes reduced to real ones: writing the same content and deleting a
   * nonexistent file are dropped, as in the daemon check.
   */
  listChanges: () => ListChanges;
}

/**
 * The config document is text, not a parsed tree: an edit is applied to the
 * original bytes, otherwise the user's key order is rewritten entirely. Schema
 * parsing lives in `api` and is needed only for display.
 */
const ConfigDocumentStateProto = stateCreator<ConfigDocumentState>((set, get) => {
  /** An edit goes onto the draft, and before the first edit onto the text from the device. */
  const patch = (edit: (text: string) => string) => {
    set((state) => {
      const text = state.draft ?? state.applied;

      return text === null ? state : { draft: edit(text), draftBase: baseOf(state) };
    });
  };
  const stored = readStoredDraft();

  return {
    applied: null,
    appliedEtag: null,
    draft: stored.draft,
    draftBase: stored.base,
    appliedLists: null,
    listsEtag: null,
    listsDraft: stored.lists,
    revision: 0,

    load: (text, etag = null) => {
      set((state) => {
        if (state.applied === text && state.appliedEtag === etag) return state;

        // Only new text moves the revision: identical bytes give an identical
        // fingerprint, and a changed etag by itself does not make the editor
        // content stale.
        return state.applied === text
          ? { appliedEtag: etag }
          : { applied: text, appliedEtag: etag, revision: state.revision + 1 };
      });
    },

    loadLists: (files, etag) => {
      set((state) => {
        if (state.listsEtag === etag && state.appliedLists !== null) return state;

        return { appliedLists: files, listsEtag: etag };
      });
    },

    editList: (name, content) => {
      set((state) => ({ listsDraft: { ...state.listsDraft, [name]: content } }));
    },

    removeList: (name) => {
      set((state) => ({ listsDraft: { ...state.listsDraft, [name]: null } }));
    },

    replace: (text) => {
      set((state) => {
        // The draft equals the applied text, so there are no edits, and keeping
        // it separately would mean showing the "draft" badge for no reason.
        const draft = text === state.applied ? null : text;

        return draft === state.draft ? state : { draft, draftBase: draft === null ? null : baseOf(state) };
      });
    },

    edit: (path, value) => {
      patch((text) => setValue(text, path, value));
    },

    editMany: (edits) => {
      if (edits.length === 0) return;

      patch((text) => edits.reduce((next, { path, value }) => setValue(next, path, value), text));
    },

    remove: (path) => {
      patch((text) => removeValue(text, path));
    },

    insert: (path, value) => {
      patch((text) => insertValue(text, path, value));
    },

    move: (path, from, to) => {
      set((state) => {
        const text = state.draft ?? state.applied;
        const next = text === null ? text : moveValue(text, path, from, to);

        return next === text ? state : { draft: next, draftBase: baseOf(state) };
      });
    },

    discard: () => {
      set((state) =>
        state.draft === null && Object.keys(state.listsDraft).length === 0
          ? state
          : { draft: null, draftBase: null, listsDraft: {}, revision: state.revision + 1 }
      );
    },

    reset: () => {
      set((state) => ({
        applied: null,
        appliedEtag: null,
        draft: null,
        draftBase: null,
        appliedLists: null,
        listsEtag: null,
        listsDraft: {},
        revision: state.revision + 1,
      }));
    },

    current: () => get().draft ?? get().applied,

    isDirty: () => {
      const { draft, applied } = get();
      const lists = get().listChanges();

      return (draft !== null && draft !== applied) || Object.keys(lists.put).length > 0 || lists.remove.length > 0;
    },

    isStale: () => {
      const { draft, draftBase, applied } = get();

      return draft !== null && draftBase !== null && applied !== null && draft !== applied && draftBase !== applied;
    },

    listChanges: () => toListChanges(get().listsDraft, get().appliedLists),
  };
}, 'ConfigDocument');

/** A started draft keeps its own base, a new one takes it from the device text. */
function baseOf(state: ConfigDocumentState): string | null {
  return state.draft === null ? state.applied : state.draftBase;
}

ConfigDocumentStateProto.subscribe(function storeDraft(state, previous) {
  if (
    state.draft === previous.draft &&
    state.draftBase === previous.draftBase &&
    state.listsDraft === previous.listsDraft
  ) {
    return;
  }

  writeStoredDraft({ base: state.draftBase, draft: state.draft, lists: state.listsDraft });
});

function toListChanges(
  listsDraft: Record<string, string | null>,
  appliedLists: Record<string, string> | null
): ListChanges {
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

export const ConfigDocumentState = createReactSelectors(ConfigDocumentStateProto);

/** The same store outside React: event handlers and writes read the text at the moment they run. */
export const ConfigDocumentStore = ConfigDocumentStateProto;

/**
 * Subscription to the presence of unsaved edits.
 *
 * The hook lives here, not on a screen: "the draft differs from the applied
 * one" is a document rule, and there must be no second copy of it. The
 * generated selector does not fit here: it would return the function itself,
 * not the result.
 */
export function useConfigText(): string | null {
  return useStore(ConfigDocumentStateProto, (state) => state.current());
}

export function useConfigDirty(): boolean {
  return useStore(ConfigDocumentStateProto, (state) => state.isDirty());
}

export function useConfigStale(): boolean {
  return useStore(ConfigDocumentStateProto, (state) => state.isStale());
}

/**
 * Browser confirmation when leaving the page while the draft has unapplied
 * edits. The handler is attached only while the draft is dirty: a permanent
 * `beforeunload` disables the browser's page cache for "back".
 */
export function useConfigLeaveGuard(): void {
  const isDirty = useConfigDirty();

  useEffect(
    function guardLeave() {
      if (!isDirty) return;

      function confirmLeave(event: BeforeUnloadEvent) {
        event.preventDefault();
        // Browsers before Chrome 119 ask only when `returnValue` is set.
        event.returnValue = true;
      }

      globalThis.addEventListener('beforeunload', confirmLeave);

      return function releaseLeave() {
        globalThis.removeEventListener('beforeunload', confirmLeave);
      };
    },
    [isDirty]
  );
}

/**
 * Line-by-line diff of the file from the device and the draft.
 *
 * The diff is computed, not stored as a store field: otherwise it would lag the
 * text by one edit. Memoization is needed here, not in the selector: a selector
 * compares the result shallowly and on a new array would redraw the screen on
 * every store change.
 */
/** List file changes the apply will bring; without edits, empty. */
export function useListChanges(): ListChanges {
  const { listsDraft, appliedLists } = useStore(ConfigDocumentStateProto, (state) => ({
    listsDraft: state.listsDraft,
    appliedLists: state.appliedLists,
  }));

  return useMemo(() => toListChanges(listsDraft, appliedLists), [listsDraft, appliedLists]);
}

export function useConfigDiff(): DiffLine[] {
  const { applied, draft } = useStore(ConfigDocumentStateProto, (state) => ({
    applied: state.applied,
    draft: state.draft,
  }));

  return useMemo(() => (applied === null || draft === null ? [] : diffLines(applied, draft)), [applied, draft]);
}
