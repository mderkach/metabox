import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';
import { MS_IN_SECOND, SECONDS_IN_MINUTE } from '@shared/lib/time';

import { toConnectionRow, toConnectionsSnapshot } from './Connection.adapter';
import {
  CLOSED_LIMIT,
  EMPTY_OUTBOUND_TYPES,
  EMPTY_SUMMARY,
  ROUTE_KIND,
  TOP_LIMIT,
  toRouteKind,
  type ConnectionRate,
  type ConnectionRow,
  type ConnectionShare,
  type ConnectionSummary,
  type ConnectionTotals,
  type RouteKind,
} from './Connection.model';

const EMPTY_TOTALS: ConnectionTotals = { upload: 0, download: 0, memory: 0 };

/** The connection snapshot arrives once a second; it has no time of its own. */
export const HISTORY_STEP_SECONDS = 1;

/** Connection count chart window is a minute, as for the traffic chart. */
export const HISTORY_WINDOW_SECONDS = SECONDS_IN_MINUTE;

/** Points in the chart window: the minute peak is computed from them. */
export const HISTORY_WINDOW_POINTS = HISTORY_WINDOW_SECONDS / HISTORY_STEP_SECONDS;

/**
 * Points beyond the left edge of the window, for the same reason as for traffic
 * (`TRAFFIC_POINTS`): the right edge lags "now" by a step, and a buffer of
 * exactly the window size would start inside the chart and jump after the
 * dropped point.
 */
const HISTORY_OFFSCREEN_POINTS = 2;

const HISTORY_POINTS = HISTORY_WINDOW_POINTS + HISTORY_OFFSCREEN_POINTS;

/**
 * Time of the connection count buffer points in epoch seconds: counted back
 * from the arrival of the last one with the snapshot step, not from the arrival
 * of each, since a collapsed tab delivers snapshots in a batch.
 */
export function toHistoryTimes(count: number, lastAt: number): number[] {
  const last = lastAt / MS_IN_SECOND;

  return Array.from({ length: count }, (_, index) => last - (count - 1 - index) * HISTORY_STEP_SECONDS);
}

const NO_RATE: ConnectionRate = { down: 0, up: 0 };

/**
 * Bounds of a plausible interval between snapshots. The stream runs once a
 * second, but a collapsed tab accumulates frames and delivers them in a batch:
 * the interval between them is near zero with a large byte delta, and gigabytes
 * per second would flash in the column. Outside the window the speed is not
 * computed at all.
 */
const MIN_INTERVAL = 0.25;
const MAX_INTERVAL = 10;

/**
 * Speed over an interval. The runtime counter only grows, but after a stream
 * reconnect a connection arrives from zero: a negative delta is dropped,
 * otherwise a negative speed would appear in the column.
 */
function toRate(current: number, previous: number, seconds: number): number {
  return seconds > 0 ? Math.max(0, (current - previous) / seconds) : 0;
}

function add<Key extends string>(groups: Map<Key, ConnectionShare<Key>>, key: Key, rate: number, volume: number): void {
  const group = groups.get(key);

  if (group === undefined) {
    groups.set(key, { key, count: 1, rate, volume });

    return;
  }

  group.count += 1;
  group.rate += rate;
  group.volume += volume;
}

/** Fast first, at equal speed the numerous, then alphabetically. */
function byLoad(left: ConnectionShare, right: ConnectionShare): number {
  return right.rate - left.rate || right.count - left.count || left.key.localeCompare(right.key);
}

/** Tops go by volume: it accumulates and does not reshuffle rows every second. */
function byVolume(left: ConnectionShare, right: ConnectionShare): number {
  return right.volume - left.volume || left.key.localeCompare(right.key);
}

/**
 * Live snapshot summary. Computed here and in one pass: there are several
 * panels on the screen, and a selector in each would walk the list every
 * second, and it has up to five thousand rows.
 *
 * The summary is computed by the panel, not a runtime reading: the source
 * serves only a flat list of connections.
 */
function toSummary(rows: ConnectionRow[]): ConnectionSummary {
  const actions = new Map<RouteKind, ConnectionShare<RouteKind>>();
  const networks = new Map<string, ConnectionShare>();
  const nodes = new Map<string, ConnectionShare>();
  const sources = new Map<string, ConnectionShare>();

  for (const row of rows) {
    const rate = row.downRate + row.upRate;
    const volume = row.download + row.upload;
    // The chain end is the node the connection exited through; the beginning is
    // the group that selected it.
    const node = row.chain.at(-1);

    add(actions, row.kind, rate, volume);
    add(networks, row.network, rate, volume);
    add(sources, row.source, rate, volume);

    if (node !== undefined && row.kind === ROUTE_KIND.Proxy) {
      add(nodes, node, rate, volume);
    }
  }

  return {
    actions: [...actions.values()].sort(byLoad),
    networks: [...networks.values()].sort(byLoad),
    nodes: [...nodes.values()].sort(byVolume).slice(0, TOP_LIMIT),
    sources: [...sources.values()].sort(byVolume).slice(0, TOP_LIMIT),
  };
}

interface ConnectionState {
  /** Open connections in snapshot order. */
  active: ConnectionRow[];
  /** Index by id: the snapshot is compared with the previous one through it without rebuilding the list. */
  index: Map<string, ConnectionRow>;
  /**
   * Closed ones are assembled by the panel: the source serves only live ones,
   * and a connection that vanished between snapshots would otherwise disappear
   * without a trace.
   */
  closed: ConnectionRow[];
  /**
   * How many closed ones were evicted from the list by `CLOSED_LIMIT`: without
   * it the truncation would be silent, and the footer could not say how many
   * the list is shown from.
   */
  evicted: number;
  totals: ConnectionTotals;
  /** Live snapshot summary: computed here so that panels do not walk the list. */
  summary: ConnectionSummary;
  /** Ring buffer of the open connection count: a minute at a one-second step plus points beyond the window edge. */
  history: number[];
  /** When the last `history` point was received: the chart time is computed from it. */
  historyAt: number | null;
  /** The stream is stopped by the user: the screen freezes, the subscription lives. */
  paused: boolean;
  /** How many screens are watching the stream now: at zero the subscription closes. */
  readers: number;
  /**
   * Outbound type of the applied config by its tag: the action tone is parsed
   * with it. An empty map means the config has not been read yet.
   */
  outboundTypes: ReadonlyMap<string, string>;
  /** Snapshots the schema did not accept: without this flag the screen would just freeze. */
  dropped: number;
  /** When the previous parsed snapshot arrived: the speed is computed from it. */
  sampledAt: number | null;
  apply: (snapshot: unknown) => void;
  /**
   * Fills an empty connection count buffer with the minute the daemon
   * accumulated: the chart opens full. A buffer the stream has already written
   * to is not touched.
   */
  seedHistory: (counts: number[]) => void;
  setPaused: (paused: boolean) => void;
  addReader: () => void;
  removeReader: () => void;
  /**
   * Recolors already parsed rows: the config arrives later than the first
   * snapshot, and an idle connection is served as the same object and will not
   * update its tone itself. A row whose tone did not change stays the same
   * object.
   */
  setOutboundTypes: (outboundTypes: ReadonlyMap<string, string>) => void;
  reset: () => void;
}

const ConnectionStateProto = stateCreator<ConnectionState>(
  (set) => ({
    active: [],
    index: new Map(),
    closed: [],
    evicted: 0,
    totals: EMPTY_TOTALS,
    summary: EMPTY_SUMMARY,
    history: [],
    historyAt: null,
    paused: false,
    readers: 0,
    outboundTypes: EMPTY_OUTBOUND_TYPES,
    dropped: 0,
    sampledAt: null,
    apply: (frame) => {
      const snapshot = toConnectionsSnapshot(frame);
      const receivedAt = Date.now();

      set((state) => {
        if (state.paused) {
          return state;
        }

        if (snapshot === null) {
          return { dropped: state.dropped + 1 };
        }

        const next = new Map<string, ConnectionRow>();
        const seconds = state.sampledAt === null ? 0 : (receivedAt - state.sampledAt) / MS_IN_SECOND;
        const measurable = seconds >= MIN_INTERVAL && seconds <= MAX_INTERVAL;

        const rows = snapshot.connections.map((connection) => {
          const previous = state.index.get(connection.id);
          const rate: ConnectionRate =
            previous === undefined || !measurable
              ? NO_RATE
              : {
                  down: toRate(connection.download, previous.download, seconds),
                  up: toRate(connection.upload, previous.upload, seconds),
                };
          // An unchanged row is served as the same object: otherwise `memo` on
          // the list row does not help, since the prop would be new on every
          // snapshot. The comparison goes by the snapshot, before parsing: on
          // five thousand connections building a row only to throw it away is
          // the main work of the handler, while most rows change only byte
          // counters.
          const kept =
            previous !== undefined &&
            previous.upload === connection.upload &&
            previous.download === connection.download &&
            previous.downRate === rate.down &&
            previous.upRate === rate.up;
          const row = kept ? previous : toConnectionRow(connection, rate, state.outboundTypes);

          next.set(row.id, row);

          return row;
        });

        const gone = state.active.filter((row) => !next.has(row.id));
        const history = [...state.history, rows.length].slice(-HISTORY_POINTS);
        // The speed is cleared: the column speaks about the present, and a
        // closed connection would forever keep the speed of its last live
        // frame.
        const stopped = gone.map((row) => ({ ...row, downRate: 0, upRate: 0 }));
        const overflow = Math.max(0, stopped.length + state.closed.length - CLOSED_LIMIT);

        return {
          active: rows,
          index: next,
          sampledAt: receivedAt,
          summary: toSummary(rows),
          history,
          historyAt: receivedAt,
          closed: gone.length > 0 ? [...stopped, ...state.closed].slice(0, CLOSED_LIMIT) : state.closed,
          evicted: state.evicted + overflow,
          totals: {
            upload: snapshot.upload_total,
            download: snapshot.download_total,
            memory: snapshot.memory,
          },
        };
      });
    },
    setPaused: (paused) => {
      set({ paused });
    },
    addReader: () => {
      set((state) => ({ readers: state.readers + 1 }));
    },
    removeReader: () => {
      set((state) => ({ readers: Math.max(0, state.readers - 1) }));
    },
    setOutboundTypes: (outboundTypes) => {
      set((state) => {
        if (state.outboundTypes === outboundTypes) {
          return state;
        }

        const active = state.active.map((row) => {
          const kind = toRouteKind(row.action, row.chain, outboundTypes);

          return kind === row.kind ? row : { ...row, kind };
        });

        if (active.every((row, position) => row === state.active[position])) {
          return { outboundTypes };
        }

        return {
          outboundTypes,
          active,
          index: new Map(active.map((row) => [row.id, row])),
          summary: toSummary(active),
        };
      });
    },
    seedHistory: (counts) => {
      set((state) =>
        state.history.length > 0 || counts.length === 0
          ? state
          : { history: counts.slice(-HISTORY_POINTS), historyAt: Date.now() }
      );
    },
    reset: () => {
      set({
        active: [],
        index: new Map(),
        closed: [],
        evicted: 0,
        totals: EMPTY_TOTALS,
        summary: EMPTY_SUMMARY,
        history: [],
        historyAt: null,
        paused: false,
        dropped: 0,
        sampledAt: null,
      });
    },
  }),
  'ConnectionStream'
);

export const ConnectionState = createReactSelectors(ConnectionStateProto);

/** Store outside React: the stream handler lives outside the component tree. */
export const ConnectionStore = ConnectionStateProto;

export function useConnectionCounts(): { active: number; closed: number } {
  return useStore(ConnectionStateProto, (state) => ({
    active: state.active.length,
    closed: state.closed.length,
  }));
}
