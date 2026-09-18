import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';
import { MS_IN_SECOND, SECONDS_IN_MINUTE } from '@shared/lib/time';

import { toConnectionRow, toConnectionsSnapshot } from './Connection.adapter';
import {
  CLOSED_LIMIT,
  EMPTY_SUMMARY,
  ROUTE_KIND,
  toRouteKind,
  TOP_LIMIT,
  type ConnectionRate,
  type ConnectionRow,
  type ConnectionShare,
  type ConnectionSummary,
  type ConnectionTotals,
  type RouteKind,
} from './Connection.model';

const EMPTY_TOTALS: ConnectionTotals = { upload: 0, download: 0, memory: 0 };

/** Минута числа соединений при шаге снапшота в секунду. */
const HISTORY_POINTS = SECONDS_IN_MINUTE;
const NO_RATE: ConnectionRate = { down: 0, up: 0 };

/**
 * Границы правдоподобного интервала между снапшотами. Поток идёт раз в секунду,
 * но свёрнутая вкладка копит кадры и отдаёт их пачкой: интервал между ними
 * околонулевой при большой дельте байт, и в колонке мелькнули бы гигабайты в
 * секунду. За пределами окна скорость не считается вовсе.
 */
const MIN_INTERVAL = 0.25;
const MAX_INTERVAL = 10;

/**
 * Скорость за интервал. Счётчик рантайма только растёт, но после переподключения
 * потока соединение приходит с нуля — отрицательная дельта отбрасывается, иначе
 * в колонке появлялась бы скорость со знаком минус.
 */
function toRate(current: number, previous: number, seconds: number): number {
  return seconds > 0 ? Math.max(0, (current - previous) / seconds) : 0;
}

function add<Key extends string>(groups: Map<Key, ConnectionShare<Key>>, key: Key, rate: number): void {
  const group = groups.get(key);

  if (group === undefined) {
    groups.set(key, { key, count: 1, rate });

    return;
  }

  group.count += 1;
  group.rate += rate;
}

/** Быстрые первыми, при равной скорости — многочисленные, затем по алфавиту. */
function byLoad(left: ConnectionShare, right: ConnectionShare): number {
  return right.rate - left.rate || right.count - left.count || left.key.localeCompare(right.key);
}

/**
 * Сводка живого снапшота. Считается здесь и одним проходом: панелей на экране
 * несколько, и селектор у каждой дал бы свой обход списка каждую секунду, а в
 * нём до пяти тысяч строк (NFR-2).
 *
 * Сводка — вычисленное панелью, а не показания рантайма (UX-8): источник
 * отдаёт только плоский список соединений.
 */
function toSummary(rows: ConnectionRow[]): ConnectionSummary {
  const actions = new Map<RouteKind, ConnectionShare<RouteKind>>();
  const networks = new Map<string, ConnectionShare>();
  const nodes = new Map<string, ConnectionShare>();
  const sources = new Map<string, ConnectionShare>();

  for (const row of rows) {
    const rate = row.downRate + row.upRate;
    const kind = toRouteKind(row.action, row.chain);
    // Конец цепочки — узел, через который соединение вышло наружу; начало —
    // группа, которая его выбрала.
    const node = row.chain.at(-1);

    add(actions, kind, rate);
    add(networks, row.network, rate);
    add(sources, row.source, rate);

    if (node !== undefined && kind === ROUTE_KIND.Proxy) {
      add(nodes, node, rate);
    }
  }

  return {
    actions: [...actions.values()].sort(byLoad),
    networks: [...networks.values()].sort(byLoad),
    nodes: [...nodes.values()].sort(byLoad).slice(0, TOP_LIMIT),
    sources: [...sources.values()].sort(byLoad).slice(0, TOP_LIMIT),
  };
}

interface ConnectionState {
  /** Открытые соединения в порядке снапшота. */
  active: ConnectionRow[];
  /** Индекс по id: по нему снапшот сверяется с прошлым, не пересобирая список. */
  index: Map<string, ConnectionRow>;
  /**
   * Закрытые собираются панелью: источник отдаёт только живые, и соединение,
   * пропавшее между снапшотами, иначе исчезло бы без следа.
   */
  closed: ConnectionRow[];
  totals: ConnectionTotals;
  /** Сводка живого снапшота: считается здесь, чтобы панели не обходили список. */
  summary: ConnectionSummary;
  /** Кольцевой буфер числа открытых соединений — минута при шаге в секунду. */
  history: number[];
  /** Поток остановлен пользователем: экран замирает, подписка живёт. */
  paused: boolean;
  /** Сколько экранов сейчас смотрит поток: по нулю подписка закрывается. */
  readers: number;
  /** Снапшотов, которые схема не приняла: экран замер бы без этого признака. */
  dropped: number;
  /** Когда пришёл прошлый разобранный снапшот: от него считается скорость. */
  sampledAt: number | null;
  apply: (snapshot: unknown) => void;
  setPaused: (paused: boolean) => void;
  addReader: () => void;
  removeReader: () => void;
  reset: () => void;
}

const ConnectionStateProto = stateCreator<ConnectionState>(
  (set) => ({
    active: [],
    index: new Map(),
    closed: [],
    totals: EMPTY_TOTALS,
    summary: EMPTY_SUMMARY,
    history: [],
    paused: false,
    readers: 0,
    dropped: 0,
    sampledAt: null,
    apply: (frame) => {
      const snapshot = toConnectionsSnapshot(frame);
      const receivedAt = Date.now();

      set((state) => {
        if (state.paused) {
          return;
        }

        if (snapshot === null) {
          state.dropped += 1;

          return;
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
          // Неизменившаяся строка отдаётся прежним объектом: иначе `memo` на
          // строке списка не спасает — пропс был бы новым каждый снапшот.
          // Сверка идёт по снапшоту, до разбора: на пяти тысячах соединений
          // (NFR-2) собирать строку, чтобы тут же её выбросить, — основная
          // работа обработчика, а меняются у большинства только счётчики байт.
          const kept =
            previous !== undefined &&
            previous.upload === connection.upload &&
            previous.download === connection.download &&
            previous.downRate === rate.down &&
            previous.upRate === rate.up;
          const row = kept ? previous : toConnectionRow(connection, rate);

          next.set(row.id, row);

          return row;
        });

        const gone = state.active.filter((row) => !next.has(row.id));

        state.active = rows;
        state.index = next;
        state.sampledAt = receivedAt;
        state.summary = toSummary(rows);
        state.history.push(rows.length);

        if (state.history.length > HISTORY_POINTS) {
          state.history.shift();
        }

        if (gone.length > 0) {
          // Скорость снимается: колонка говорит про настоящее время, а закрытое
          // соединение навсегда осталось бы со скоростью последнего живого кадра.
          const stopped = gone.map((row) => ({ ...row, downRate: 0, upRate: 0 }));

          state.closed = [...stopped, ...state.closed].slice(0, CLOSED_LIMIT);
        }
        state.totals = {
          upload: snapshot.upload_total,
          download: snapshot.download_total,
          memory: snapshot.memory,
        };
      });
    },
    setPaused: (paused) => {
      set((state) => {
        state.paused = paused;
      });
    },
    addReader: () => {
      set((state) => {
        state.readers += 1;
      });
    },
    removeReader: () => {
      set((state) => {
        state.readers = Math.max(0, state.readers - 1);
      });
    },
    reset: () => {
      set((state) => {
        state.active = [];
        state.index = new Map();
        state.closed = [];
        state.totals = EMPTY_TOTALS;
        state.summary = EMPTY_SUMMARY;
        state.history = [];
        state.paused = false;
        state.dropped = 0;
        state.sampledAt = null;
      });
    },
  }),
  'ConnectionStream'
);

export const ConnectionState = createReactSelectors(ConnectionStateProto);

/** Стор снаружи React: обработчик потока живёт вне дерева компонентов. */
export const ConnectionStore = ConnectionStateProto;

export function useConnectionCounts(): { active: number; closed: number } {
  return useStore(ConnectionStateProto, (state) => ({
    active: state.active.length,
    closed: state.closed.length,
  }));
}
