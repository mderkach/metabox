import type { ColumnOrderState, ColumnVisibilityState, OnChangeFn, SortingState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

import { MS_IN_SECOND } from '@shared/lib/time';

import { CONNECTION_COLUMNS_HIDDEN } from '../ui/ConnectionColumns';

export const TABLE_DENSITY = {
  Compact: 'compact',
  Comfortable: 'comfortable',
} as const;

export type TableDensity = (typeof TABLE_DENSITY)[keyof typeof TABLE_DENSITY];

export const DENSITY_PADDING: Readonly<Record<TableDensity, string>> = {
  [TABLE_DENSITY.Compact]: 'py-1',
  [TABLE_DENSITY.Comfortable]: 'py-2',
};

/** Оценка высоты строки под каждый режим: точную виртуализатор измеряет сам. */
export const DENSITY_ROW_ESTIMATE: Readonly<Record<TableDensity, number>> = {
  [TABLE_DENSITY.Compact]: 40,
  [TABLE_DENSITY.Comfortable]: 48,
};

const LIVE_SECONDS = 1;
const SLOW_SECONDS = 5;
const SLOWER_SECONDS = 15;

/**
 * Как часто обновляется показанный набор строк. Поток идёт раз в секунду, и на
 * живом роутере список переставляется под курсором быстрее, чем его читают.
 */
export const REFRESH_INTERVAL = {
  Live: LIVE_SECONDS * MS_IN_SECOND,
  Slow: SLOW_SECONDS * MS_IN_SECOND,
  Slower: SLOWER_SECONDS * MS_IN_SECOND,
} as const;

export type RefreshInterval = (typeof REFRESH_INTERVAL)[keyof typeof REFRESH_INTERVAL];

const STORAGE_KEY = 'metabox.connections.view';

/**
 * Хранилище отдаёт строку, и она может быть чем угодно: ключ переживает версии
 * панели. Недостающее поле берётся из вида по умолчанию, незнакомое значение
 * сбрасывает к нему весь вид; экран не падает ни в том, ни в другом случае.
 */
const StoredViewSchema = z.object({
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).optional(),
  columns: z.record(z.string(), z.boolean()).optional(),
  // Поле появилось позже остальных: вид, сохранённый до него, читается с
  // порядком описаний, а не сбрасывается целиком.
  order: z.array(z.string()).optional(),
  density: z.enum(TABLE_DENSITY).optional(),
  interval: z.literal([REFRESH_INTERVAL.Live, REFRESH_INTERVAL.Slow, REFRESH_INTERVAL.Slower]).optional(),
});

/** Вид списка: то, что переживает перезагрузку страницы. */
interface StoredView {
  sorting: SortingState;
  columns: ColumnVisibilityState;
  /** Порядок колонок идентификаторами; пустой — порядок описаний. */
  order: ColumnOrderState;
  density: TableDensity;
  interval: RefreshInterval;
}

const DEFAULT_VIEW: StoredView = {
  sorting: [],
  columns: CONNECTION_COLUMNS_HIDDEN,
  order: [],
  density: TABLE_DENSITY.Comfortable,
  interval: REFRESH_INTERVAL.Live,
};

/** В приватном окне обращение к хранилищу бросает. */
function readView(): StoredView {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return DEFAULT_VIEW;
    }

    const stored = StoredViewSchema.safeParse(JSON.parse(raw));

    if (!stored.success) {
      return DEFAULT_VIEW;
    }

    return {
      sorting: stored.data.sorting ?? DEFAULT_VIEW.sorting,
      columns: stored.data.columns ?? DEFAULT_VIEW.columns,
      order: stored.data.order ?? DEFAULT_VIEW.order,
      density: stored.data.density ?? DEFAULT_VIEW.density,
      interval: stored.data.interval ?? DEFAULT_VIEW.interval,
    };
  } catch {
    // Хранилище недоступно или в ключе не JSON — вид собирается заново.
    return DEFAULT_VIEW;
  }
}

function writeView(view: StoredView): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Не сохранилось — вид вернётся к исходному при следующем открытии.
  }
}

export interface ConnectionView extends StoredView {
  setSorting: OnChangeFn<SortingState>;
  setColumns: OnChangeFn<ColumnVisibilityState>;
  setOrder: OnChangeFn<ColumnOrderState>;
  setDensity: (density: TableDensity) => void;
  setInterval: (interval: RefreshInterval) => void;
}

/**
 * Вид списка соединений: сортировка, видимые колонки и их порядок, плотность
 * и частота обновления. Настройка личная, как тема и язык: панель роутера открывают
 * несколько человек, и общая на всех была бы ограничением.
 *
 * Объект вида стабилен между снапшотами: он уходит в мемоизированное тело
 * таблицы, и новая ссылка на каждый тик перерисовывала бы скрытую вкладку.
 */
export function useConnectionView(): ConnectionView {
  const [view, setView] = useState(readView);

  // Хранилище пишется снаружи обновления состояния: React зовёт обновляющую
  // функцию дважды в строгом режиме, и запись ушла бы в неё вместе с остальным.
  const update = useCallback(
    (patch: Partial<StoredView>) => {
      const next = { ...view, ...patch };

      writeView(next);
      setView(next);
    },
    [view]
  );

  const onSortingChange: OnChangeFn<SortingState> = useCallback(
    (updater) => {
      update({ sorting: typeof updater === 'function' ? updater(view.sorting) : updater });
    },
    [update, view.sorting]
  );

  const onColumnsChange: OnChangeFn<ColumnVisibilityState> = useCallback(
    (updater) => {
      update({ columns: typeof updater === 'function' ? updater(view.columns) : updater });
    },
    [update, view.columns]
  );

  const onOrderChange: OnChangeFn<ColumnOrderState> = useCallback(
    (updater) => {
      update({ order: typeof updater === 'function' ? updater(view.order) : updater });
    },
    [update, view.order]
  );

  const onDensityChange = useCallback(
    (density: TableDensity) => {
      update({ density });
    },
    [update]
  );

  const onIntervalChange = useCallback(
    (interval: RefreshInterval) => {
      update({ interval });
    },
    [update]
  );

  return useMemo(
    () => ({
      ...view,
      setSorting: onSortingChange,
      setColumns: onColumnsChange,
      setOrder: onOrderChange,
      setDensity: onDensityChange,
      setInterval: onIntervalChange,
    }),
    [view, onSortingChange, onColumnsChange, onOrderChange, onDensityChange, onIntervalChange]
  );
}
