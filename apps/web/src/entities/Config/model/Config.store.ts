import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';

import { diffLines, type DiffLine } from '@shared/lib/diff';
import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';

import { findValue, insertValue, removeValue, setValue } from './Config.model';

export interface ConfigDocumentState {
  /** Текст с устройства. `null` — конфиг ещё не прочитан. */
  applied: string | null;
  /** Правки пользователя поверх `applied`. `null` — правок не было. */
  draft: string | null;
  /**
   * Счётчик обновлений, пришедших не от пользователя: загрузка с устройства и
   * отмена правок. По нему текстовый редактор понимает, что его содержимое
   * устарело; собственные правки счётчик не двигают, иначе поле пересоздавалось
   * бы на каждый набранный символ.
   */
  revision: number;
  load: (text: string) => void;
  /** Замена текста целиком: режим правки всего конфига руками. */
  replace: (text: string) => void;
  edit: (path: JSONPath, value: unknown) => void;
  remove: (path: JSONPath) => void;
  insert: (path: JSONPath, value: unknown) => void;
  move: (path: JSONPath, from: number, to: number) => void;
  discard: () => void;
  /** Забыть и файл, и черновик: панель перечитывает конфиг с устройства. */
  reset: () => void;
  /** Текст, который увидит пользователь и который уйдёт в Apply. */
  current: () => string | null;
  isDirty: () => boolean;
}

/**
 * Документ конфига — текст, а не разобранное дерево: правка применяется к
 * исходным байтам, иначе порядок ключей пользователя переписывается целиком
 *. Разбор схемой живёт в `api` и нужен только для показа.
 */
const ConfigDocumentStateProto = stateCreator<ConfigDocumentState>((set, get) => {
  /** Правка ложится на черновик, а до первой правки — на текст с устройства. */
  const patch = (edit: (text: string) => string) => {
    set((state) => {
      const text = state.draft ?? state.applied;

      return text === null ? state : { draft: edit(text) };
    });
  };

  return {
    applied: null,
    draft: null,
    revision: 0,

    load: (text) => {
      set((state) => (state.applied === text ? state : { applied: text, revision: state.revision + 1 }));
    },

    replace: (text) => {
      set((state) => {
        // Черновик равен применённому тексту — правок нет, и держать его
        // отдельно значило бы показывать бейдж «черновик» без причины.
        const draft = text === state.applied ? null : text;

        return draft === state.draft ? state : { draft };
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

        if (text === null || from === to) return state;

        const node = findValue(text, [...path, from]);

        if (node === undefined) return state;

        return { draft: insertValue(removeValue(text, [...path, from]), [...path, to], node) };
      });
    },

    discard: () => {
      set((state) => (state.draft === null ? state : { draft: null, revision: state.revision + 1 }));
    },

    reset: () => {
      set((state) => ({ applied: null, draft: null, revision: state.revision + 1 }));
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
export function useConfigText(): string | null {
  return useStore(ConfigDocumentStateProto, (state) => state.current());
}

export function useConfigDirty(): boolean {
  return useStore(ConfigDocumentStateProto, (state) => state.isDirty());
}

/**
 * Построчный диф файла с устройства и черновика.
 *
 * Диф считается, а не хранится полем стора: иначе он отставал бы от текста на
 * одну правку. Мемоизация нужна здесь, а не в селекторе: селектор сверяет
 * результат поверхностно и на новом массиве перерисовывал бы экран на каждое
 * изменение стора.
 */
export function useConfigDiff(): DiffLine[] {
  const { applied, draft } = useStore(ConfigDocumentStateProto, (state) => ({
    applied: state.applied,
    draft: state.draft,
  }));

  return useMemo(() => (applied === null || draft === null ? [] : diffLines(applied, draft)), [applied, draft]);
}
