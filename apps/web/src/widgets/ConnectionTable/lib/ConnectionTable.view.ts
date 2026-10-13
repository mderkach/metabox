import type { ColumnOrderState, ColumnVisibilityState, OnChangeFn, SortingState } from '@tanstack/react-table';
import { useCallback, useMemo, useRef, useState } from 'react';
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

/** Row height estimate for each mode: the virtualizer measures the exact one itself. */
export const DENSITY_ROW_ESTIMATE: Readonly<Record<TableDensity, number>> = {
  [TABLE_DENSITY.Compact]: 40,
  [TABLE_DENSITY.Comfortable]: 48,
};

const LIVE_SECONDS = 1;
const SLOW_SECONDS = 5;
const SLOWER_SECONDS = 15;

/**
 * How often the shown row set updates. The stream runs once a second, and on a
 * live router the list rearranges under the cursor faster than it can be read.
 */
export const REFRESH_INTERVAL = {
  Live: LIVE_SECONDS * MS_IN_SECOND,
  Slow: SLOW_SECONDS * MS_IN_SECOND,
  Slower: SLOWER_SECONDS * MS_IN_SECOND,
} as const;

export type RefreshInterval = (typeof REFRESH_INTERVAL)[keyof typeof REFRESH_INTERVAL];

const STORAGE_KEY = 'metabox.connections.view';

/**
 * Storage returns a string, and it can be anything: the key outlives
 * panel versions. A missing field is taken from the default view, an unfamiliar value
 * resets the whole view to it; the screen does not crash in either case.
 */
const StoredViewSchema = z.object({
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).optional(),
  columns: z.record(z.string(), z.boolean()).optional(),
  // The field appeared later than the others: a view saved before it is read with
  // the definition order, rather than being reset entirely.
  order: z.array(z.string()).optional(),
  density: z.enum(TABLE_DENSITY).optional(),
  interval: z.literal([REFRESH_INTERVAL.Live, REFRESH_INTERVAL.Slow, REFRESH_INTERVAL.Slower]).optional(),
});

/** List view: what survives a page reload. */
interface StoredView {
  sorting: SortingState;
  columns: ColumnVisibilityState;
  /** Column order by identifiers; empty means definition order. */
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

/** In a private window, storage access throws. */
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
    // Storage is unavailable or the key is not JSON — the view is built anew.
    return DEFAULT_VIEW;
  }
}

function writeView(view: StoredView): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Not saved — the view returns to the default on the next open.
  }
}

export interface ConnectionView extends StoredView {
  setSorting: OnChangeFn<SortingState>;
  setColumns: OnChangeFn<ColumnVisibilityState>;
  setOrder: OnChangeFn<ColumnOrderState>;
  /** Returns column visibility and order in one view change; leaves the rest of the view untouched. */
  resetColumns: () => void;
  setDensity: (density: TableDensity) => void;
  setInterval: (interval: RefreshInterval) => void;
}

/**
 * Connection list view: sorting, visible columns and their order, density
 * and refresh rate. The setting is personal, like theme and language: several people open
 * the router panel, and one shared for all would be a limitation.
 *
 * The view object is stable between snapshots: it goes into the memoized table
 * body, and a new reference on every tick would rerender the hidden tab.
 */
export function useConnectionView(): ConnectionView {
  const [view, setView] = useState(readView);
  // The latest view lives in a ref rather than being taken from the closure: a reset calls two
  // setters from one handler, and the second, closed over the view of the same render,
  // would overwrite the first's edit — both in state and in storage.
  const latest = useRef(view);

  // Storage is written outside the state update: React calls the updater
  // function twice in strict mode, and the write would go into it along with the rest.
  const update = useCallback((patch: Partial<StoredView>) => {
    const next = { ...latest.current, ...patch };

    latest.current = next;
    writeView(next);
    setView(next);
  }, []);

  const onSortingChange: OnChangeFn<SortingState> = useCallback(
    (updater) => {
      update({ sorting: typeof updater === 'function' ? updater(latest.current.sorting) : updater });
    },
    [update]
  );

  const onColumnsChange: OnChangeFn<ColumnVisibilityState> = useCallback(
    (updater) => {
      update({ columns: typeof updater === 'function' ? updater(latest.current.columns) : updater });
    },
    [update]
  );

  const onOrderChange: OnChangeFn<ColumnOrderState> = useCallback(
    (updater) => {
      update({ order: typeof updater === 'function' ? updater(latest.current.order) : updater });
    },
    [update]
  );

  const onColumnsReset = useCallback(() => {
    update({ columns: CONNECTION_COLUMNS_HIDDEN, order: DEFAULT_VIEW.order });
  }, [update]);

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
      resetColumns: onColumnsReset,
      setDensity: onDensityChange,
      setInterval: onIntervalChange,
    }),
    [view, onSortingChange, onColumnsChange, onOrderChange, onColumnsReset, onDensityChange, onIntervalChange]
  );
}
