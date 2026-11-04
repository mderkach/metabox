import type { JSONPath } from 'jsonc-parser';

import { fingerprint } from '@shared/lib/fingerprint';
import { createReactSelectors, stateCreator } from '@shared/lib/state';

import { insertValue, moveValue, nameValue, removeValue, setValue } from './Config.model';
import type { NodeEdit } from './Config.patch';
import { readStoredDraft, writeStoredDraft } from './Config.storage';

export interface ConfigDocumentState {
  /** Text from the device. `null` means the config has not been read yet. */
  applied: string | null;
  /** Daemon ETag for Apply's `If-Match`; `null` omits the base check. */
  appliedEtag: string | null;
  /** User edits on top of `applied`. `null` means there were no edits. */
  draft: string | null;
  /** Fingerprint of the draft's original device text, used to detect external edits across reloads. */
  draftBase: string | null;
  /** Files of its own lists from the device: name to content. `null` means not read. */
  appliedLists: Record<string, string> | null;
  /** Fingerprint of the file set from the device; goes into the apply `lists_base`. */
  listsEtag: string | null;
  /** File edits on top of `appliedLists`: name to content, `null` means delete. */
  listsDraft: Record<string, string | null>;
  /** Invalidates text editors on external updates or discard, but never on the user's keystrokes. */
  revision: number;
  load: (text: string, etag?: string | null) => void;
  loadLists: (files: Record<string, string>, etag: string | null) => void;
  replace: (text: string) => void;
  edit: (path: JSONPath, value: unknown) => void;
  /** Applies a batch atomically so subscribers never see intermediate text. */
  editMany: (edits: readonly NodeEdit[]) => void;
  /** `false` refuses an unsafe edit without changing the draft. */
  remove: (path: JSONPath) => boolean;
  /** `false` refuses an unsafe edit without changing the draft. */
  insert: (path: JSONPath, value: unknown) => boolean;
  /** `false` means the source layout cannot be moved safely; the document stays unchanged. */
  move: (path: JSONPath, from: number, to: number) => boolean;
  /** Names a list element with the comment above it, an empty name removes it; `false` refuses an unsafe edit. */
  rename: (path: JSONPath, name: string) => boolean;
  /** Write a list file into the draft; apply will deliver it in the envelope. */
  editList: (name: string, content: string) => void;
  /** Remove a list file on apply. */
  removeList: (name: string) => void;
  discard: () => void;
  /** Moves the base of the draft onto the text `base`: what it was written on top of is now on the device. */
  rebase: (base: string) => void;
  /** Forget both the file and the draft: the panel rereads the config from the device. */
  reset: () => void;
}

const ConfigDocumentStateProto = stateCreator<ConfigDocumentState>((set, get) => {
  const patch = (edit: (text: string) => string | null): boolean => {
    const state = get();
    const text = state.draft ?? state.applied;

    if (text === null) return false;

    const next = edit(text);

    if (next === null) return false;
    if (next !== text) set({ draft: next, draftBase: baseOf(state) });

    return true;
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

    remove: (path) => patch((text) => removeValue(text, path)),

    insert: (path, value) => patch((text) => insertValue(text, path, value)),

    move: (path, from, to) => patch((text) => moveValue(text, path, from, to)),

    rename: (path, name) => patch((text) => nameValue(text, path, name)),

    discard: () => {
      set((state) =>
        state.draft === null && Object.keys(state.listsDraft).length === 0
          ? state
          : { draft: null, draftBase: null, listsDraft: {}, revision: state.revision + 1 }
      );
    },

    rebase: (base) => {
      set((state) => {
        if (state.draft === null) return state;

        const draftBase = fingerprint(base);

        return state.draftBase === draftBase ? state : { draftBase };
      });
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
  };
}, 'ConfigDocument');

/** A started draft keeps its own base, a new one takes it from the device text. */
function baseOf(state: ConfigDocumentState): string | null {
  if (state.draft !== null) return state.draftBase;

  return state.applied === null ? null : fingerprint(state.applied);
}

export const ConfigDocumentState = createReactSelectors(ConfigDocumentStateProto);

export const ConfigDocumentStore = ConfigDocumentStateProto;

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
