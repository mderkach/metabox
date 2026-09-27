import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';

import { diffLines, type DiffLine } from '@shared/lib/diff';
import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';

import { findValue, insertValue, removeValue, setValue } from './Config.model';

/** Изменения файлов списков, готовые уехать конвертом применения. */
export interface ListChanges {
  put: Record<string, string>;
  remove: string[];
}

export interface ConfigDocumentState {
  /** Текст с устройства. `null` — конфиг ещё не прочитан. */
  applied: string | null;
  /**
   * Отпечаток `applied` из `ETag` ответа демона; с ним черновик уходит в
   * `If-Match` применения. `null` — отпечатка не было, применение идёт без
   * сверки базы.
   */
  appliedEtag: string | null;
  /** Правки пользователя поверх `applied`. `null` — правок не было. */
  draft: string | null;
  /** Файлы своих списков с устройства: имя → содержимое. `null` — не читались. */
  appliedLists: Record<string, string> | null;
  /** Отпечаток набора файлов с устройства; уходит в `lists_base` применения. */
  listsEtag: string | null;
  /** Правки файлов поверх `appliedLists`: имя → содержимое, `null` — удалить. */
  listsDraft: Record<string, string | null>;
  /**
   * Счётчик обновлений, пришедших не от пользователя: загрузка с устройства и
   * отмена правок. По нему текстовый редактор понимает, что его содержимое
   * устарело; собственные правки счётчик не двигают, иначе поле пересоздавалось
   * бы на каждый набранный символ.
   */
  revision: number;
  load: (text: string, etag?: string | null) => void;
  loadLists: (files: Record<string, string>, etag: string | null) => void;
  /** Замена текста целиком: режим правки всего конфига руками. */
  replace: (text: string) => void;
  edit: (path: JSONPath, value: unknown) => void;
  remove: (path: JSONPath) => void;
  insert: (path: JSONPath, value: unknown) => void;
  move: (path: JSONPath, from: number, to: number) => void;
  /** Записать файл списка в черновик; применение довезёт его конвертом. */
  editList: (name: string, content: string) => void;
  /** Убрать файл списка при применении. */
  removeList: (name: string) => void;
  discard: () => void;
  /** Забыть и файл, и черновик: панель перечитывает конфиг с устройства. */
  reset: () => void;
  /** Текст, который увидит пользователь и который уйдёт в Apply. */
  current: () => string | null;
  isDirty: () => boolean;
  /**
   * Изменения файлов, сведённые к реальным: запись того же содержимого и
   * удаление несуществующего файла выбрасываются, как и у сверки демона.
   */
  listChanges: () => ListChanges;
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
    appliedEtag: null,
    draft: null,
    appliedLists: null,
    listsEtag: null,
    listsDraft: {},
    revision: 0,

    load: (text, etag = null) => {
      set((state) => {
        if (state.applied === text && state.appliedEtag === etag) return state;

        // Ревизию двигает только новый текст: одинаковые байты дают одинаковый
        // отпечаток, и сменившийся etag сам по себе содержимое редактора не старит.
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
      set((state) =>
        state.draft === null && Object.keys(state.listsDraft).length === 0
          ? state
          : { draft: null, listsDraft: {}, revision: state.revision + 1 }
      );
    },

    reset: () => {
      set((state) => ({
        applied: null,
        appliedEtag: null,
        draft: null,
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

    listChanges: () => toListChanges(get().listsDraft, get().appliedLists),
  };
}, 'ConfigDocument');

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
/** Изменения файлов списков, которые принесёт применение; без правок — пусто. */
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
