import type { JSONPath } from 'jsonc-parser';

import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';

import { findValue, insertValue, removeValue, setValue } from './Config.model';

export interface ConfigDocumentState {
  /** Текст с устройства. `null` — конфиг ещё не прочитан. */
  applied: string | null;
  /** Правки пользователя поверх `applied`. `null` — правок не было. */
  draft: string | null;
  load: (text: string) => void;
  edit: (path: JSONPath, value: unknown) => void;
  remove: (path: JSONPath) => void;
  insert: (path: JSONPath, value: unknown) => void;
  move: (path: JSONPath, from: number, to: number) => void;
  discard: () => void;
  /** Текст, который увидит пользователь и который уйдёт в Apply. */
  current: () => string | null;
  isDirty: () => boolean;
}

/**
 * Документ конфига — текст, а не разобранное дерево: правка применяется к
 * исходным байтам, иначе порядок ключей пользователя переписывается целиком
 * (ADR-0004, AC-2). Разбор схемой живёт в `api` и нужен только для показа.
 */
const ConfigDocumentStateProto = stateCreator<ConfigDocumentState>((set, get) => {
  /** Правка ложится на черновик, а до первой правки — на текст с устройства. */
  const patch = (edit: (text: string) => string) => {
    set((state) => {
      const text = state.draft ?? state.applied;

      if (text !== null) state.draft = edit(text);
    });
  };

  return {
    applied: null,
    draft: null,

    load: (text) => {
      set((state) => {
        state.applied = text;
      });
    },

    edit: (path, value) => {
      patch((text) => setValue(text, path, value));
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

        if (text === null || from === to) return;

        const node = findValue(text, [...path, from]);

        if (node === undefined) return;

        state.draft = insertValue(removeValue(text, [...path, from]), [...path, to], node);
      });
    },

    discard: () => {
      set((state) => {
        state.draft = null;
      });
    },

    current: () => get().draft ?? get().applied,

    isDirty: () => {
      const { draft, applied } = get();

      return draft !== null && draft !== applied;
    },
  };
}, 'ConfigDocument');

export const ConfigDocumentState = createReactSelectors(ConfigDocumentStateProto);

/**
 * Подписка на наличие несохранённых правок.
 *
 * Хук живёт здесь, а не на экране: «черновик отличается от применённого» —
 * правило документа, и второй его копии быть не должно. Сгенерированный
 * селектор тут не годится — он вернул бы саму функцию, а не результат.
 */
export function useConfigDirty(): boolean {
  return useStore(ConfigDocumentStateProto, (state) => state.isDirty());
}
