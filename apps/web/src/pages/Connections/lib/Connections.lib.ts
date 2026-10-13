import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

import {
  CONNECTION_FACET,
  CONNECTION_FACETS,
  CONNECTION_TAB,
  ConnectionState,
  EMPTY_FACET_SELECTION,
  filterConnections,
  hasFacetSelection,
  toFacetSearch,
  toFacetSelection,
  type ConnectionFacet,
  type ConnectionFacetSelection,
  type ConnectionFacetValues,
  type ConnectionFilterResult,
  type ConnectionRow,
  type ConnectionSourceLabel,
  type ConnectionSearch,
  type ConnectionTab,
} from '@entities/Connection';
import { deviceLabel, useDeviceIndex } from '@entities/Device';
import { CONNECTION_FIELD, type ConnectionField } from '@widgets/ConnectionTable';

import { useThrottledRows } from './Connections.throttle';

/**
 * Set of one tab: both live at the same time, so each has its own. For a hidden
 * tab it is frozen; see `useWhileVisible`.
 */
export interface ConnectionTabRows {
  rows: ConnectionRow[];
  /** How many rows are in the tab before selection: the footer reports both values. */
  total: number;
}

/** Live tab counters: the number on the label does not wait for the tab to be opened. */
export type ConnectionTabCounts = Readonly<Record<ConnectionTab, number>>;

interface VisibleValue<T> {
  visible: boolean;
  value: T;
}

/**
 * The value a hidden tab sees frozen: while it is hidden, the hook serves what
 * was there at the moment it was hidden, and a shown one gets the current value
 * in the same frame it becomes visible.
 *
 * A hidden tab sits under `Activity` and is rerendered at lowered priority on
 * every new prop. A new snapshot once a second is a new prop, and a tab nobody
 * sees would be filtered and redrawn on every tick.
 *
 * The state changes only on a visibility change, not on every value: otherwise
 * every tick would cost an extra pass over the screen.
 */
export function useWhileVisible<T>(value: T, visible: boolean): T {
  const [frozen, setFrozen] = useState<VisibleValue<T>>({ visible, value });

  if (frozen.visible !== visible) {
    setFrozen({ visible, value });
  }

  return visible ? value : frozen.value;
}

export interface ConnectionsScreen {
  tab: ConnectionTab;
  setTab: (tab: ConnectionTab) => void;
  query: string;
  setQuery: (query: string) => void;
  selection: ConnectionFacetSelection;
  setFacet: (facet: ConnectionFacet, values: readonly string[]) => void;
  /** Clears all facets and keeps the search: it was typed by hand and is visible in the field. */
  resetFacets: () => void;
  /** Clears the search and facets: the button on an empty screen must bring the list back. */
  reset: () => void;
  /** Facet values and counters of the shown tab; counting rules are in `filterConnections`. */
  facets: ConnectionFacetValues;
  /** Device label by address: the facet stores the address but shows the label. */
  sourceLabel: ConnectionSourceLabel;
  /** Columns by whose field a facet is set: the table header carries the selection mark. */
  filteredColumns: ReadonlySet<ConnectionField>;
  active: ConnectionTabRows;
  closed: ConnectionTabRows;
  counts: ConnectionTabCounts;
  filtered: boolean;
}

/** Table column that shows the facet field. The action is colored by packet fate. */
const FACET_COLUMN: Readonly<Record<ConnectionFacet, ConnectionField>> = {
  [CONNECTION_FACET.Source]: CONNECTION_FIELD.Source,
  [CONNECTION_FACET.Kind]: CONNECTION_FIELD.Action,
  [CONNECTION_FACET.Rule]: CONNECTION_FIELD.Rule,
  [CONNECTION_FACET.Chain]: CONNECTION_FIELD.Chain,
  [CONNECTION_FACET.Network]: CONNECTION_FIELD.Network,
};

function useTabFilter(
  all: ConnectionRow[],
  query: string,
  selection: ConnectionFacetSelection,
  sourceLabel: ConnectionSourceLabel
): ConnectionFilterResult {
  return useMemo(() => filterConnections(all, query, selection, sourceLabel), [all, query, selection, sourceLabel]);
}

/**
 * Connections screen state: tab, search and facets. Selection is client-side:
 * the snapshot is already entirely in the panel, and going to the device for a
 * filtered list would show not what is in the store.
 *
 * `interval` sets the refresh rate of the shown set: counters, facets and the
 * footer speak about it, not about the last snapshot that arrived.
 */
export function useConnectionsScreen(interval: number): ConnectionsScreen {
  const search = useSearch({ from: '/connections' });
  const navigate = useNavigate({ from: '/connections' });

  const tab = search.tab ?? CONNECTION_TAB.Active;
  const query = search.q ?? '';
  // The URL serves values with structural sharing: references stand while the
  // value does not change, and selection does not recompute the filter on every
  // render.
  const { source, kind, match, chain, network } = search;
  const selection = useMemo(
    () => toFacetSelection({ source, kind, match, chain, network }),
    [source, kind, match, chain, network]
  );

  // The connections screen is the only one polling the device list while open:
  // cells and the route explanation read the same cache without a timer of
  // their own.
  const devices = useDeviceIndex({ poll: true });
  const sourceLabel = useCallback((ip: string) => deviceLabel(ip, devices), [devices]);

  // Selection replaces the URL rather than adding a history entry: otherwise
  // "back" after a typed query would unwind it letter by letter. An empty value
  // from the URL is removed, not left as a `?q=` tail.
  const patchSearch = useCallback(
    (patch: Partial<ConnectionSearch>) => {
      void navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );

  const setTab = useCallback(
    (next: ConnectionTab) => {
      patchSearch({ tab: next === CONNECTION_TAB.Active ? undefined : next });
    },
    [patchSearch]
  );

  const setQuery = useCallback(
    (next: string) => {
      patchSearch({ q: next === '' ? undefined : next });
    },
    [patchSearch]
  );

  const setFacet = useCallback(
    (facet: ConnectionFacet, values: readonly string[]) => {
      patchSearch(toFacetSearch({ ...selection, [facet]: values }));
    },
    [patchSearch, selection]
  );

  const resetFacets = useCallback(() => {
    patchSearch(toFacetSearch(EMPTY_FACET_SELECTION));
  }, [patchSearch]);

  // The throttle sits before selection and is separate for each tab: a facet
  // press must respond at once, and a tab switch must show its own set, not the
  // neighbor's until the end of the period.
  const liveRows = useThrottledRows(ConnectionState.use.active(), interval);
  const closedRows = useThrottledRows(ConnectionState.use.closed(), interval);
  // A hidden tab gets the set frozen at the moment it was hidden: selection
  // over it is not recomputed on every snapshot, and the table body is not
  // redrawn. The shown one gets the current set in the same frame it becomes
  // visible.
  const liveShown = useWhileVisible(liveRows, tab === CONNECTION_TAB.Active);
  const closedShown = useWhileVisible(closedRows, tab === CONNECTION_TAB.Closed);
  const activeFilter = useTabFilter(liveShown, query, selection, sourceLabel);
  const closedFilter = useTabFilter(closedShown, query, selection, sourceLabel);
  const counts = { [CONNECTION_TAB.Active]: liveRows.length, [CONNECTION_TAB.Closed]: closedRows.length };

  const reset = useCallback(() => {
    patchSearch({ q: undefined, ...toFacetSearch(EMPTY_FACET_SELECTION) });
  }, [patchSearch]);

  const filteredColumns = useMemo(
    () => new Set(CONNECTION_FACETS.filter((facet) => selection[facet].length > 0).map((facet) => FACET_COLUMN[facet])),
    [selection]
  );

  return {
    tab,
    setTab,
    query,
    setQuery,
    selection,
    setFacet,
    resetFacets,
    reset,
    // Facets and search are shared but computed over the shown tab: otherwise a
    // slice by device would name the neighbor's numbers.
    facets: tab === CONNECTION_TAB.Closed ? closedFilter.facets : activeFilter.facets,
    sourceLabel,
    filteredColumns,
    active: { rows: activeFilter.rows, total: liveShown.length },
    closed: { rows: closedFilter.rows, total: closedShown.length },
    counts,
    filtered: query.length > 0 || hasFacetSelection(selection),
  };
}
