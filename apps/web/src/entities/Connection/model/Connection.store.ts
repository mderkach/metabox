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

/** Быстрые первыми, при равной скорости — многочисленные, затем по алфавиту. */
function byLoad(left: ConnectionShare, right: ConnectionShare): number {
  return right.rate - left.rate || right.count - left.count || left.key.localeCompare(right.key);
}

/**
 * Сводка живого снапшота. Считается здесь и одним проходом: панелей на экране
 * несколько, и селектор у каждой дал бы свой обход списка каждую секунду, а в
 * нём до пяти тысяч строк.
 *
 * Сводка — вычисленное панелью, а не показания рантайма: источник
 * отдаёт только плоский список соединений.
 */
function toSummary(rows: ConnectionRow[]): ConnectionSummary {
  const actions = new Map<RouteKind, ConnectionShare<RouteKind>>();
  const networks = new Map<string, ConnectionShare>();
  const nodes = new Map<string, ConnectionShare>();
  const sources = new Map<string, ConnectionShare>();

  for (const row of rows) {
    const rate = row.downRate + row.upRate;
    const volume = row.download + row.upload;
    // Конец цепочки — узел, через который соединение вышло наружу; начало —
    // группа, которая его выбрала.
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
  /**
   * Тип аутбаунда применённого конфига по его тегу: по нему разбирается тон
   * действия. Пустая карта — конфиг ещё не прочитан.
   */
  outboundTypes: ReadonlyMap<string, string>;
  /** Снапшотов, которые схема не приняла: экран замер бы без этого признака. */
  dropped: number;
  /** Когда пришёл прошлый разобранный снапшот: от него считается скорость. */
  sampledAt: number | null;
  apply: (snapshot: unknown) => void;
  setPaused: (paused: boolean) => void;
  addReader: () => void;
  removeReader: () => void;
  /**
   * Перекрашивает уже разобранные строки: конфиг приходит позже первого
   * снапшота, а простаивающее соединение отдаётся прежним объектом и само
   * тон не обновит. Строка, чей тон не изменился, остаётся тем же объектом.
   */
  setOutboundTypes: (outboundTypes: ReadonlyMap<string, string>) => void;
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
          // Неизменившаяся строка отдаётся прежним объектом: иначе `memo` на
          // строке списка не спасает — пропс был бы новым каждый снапшот.
          // Сверка идёт по снапшоту, до разбора: на пяти тысячах соединений
          // собирать строку, чтобы тут же её выбросить, — основная работа
          // обработчика, а меняются у большинства только счётчики байт.
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
        // Скорость снимается: колонка говорит про настоящее время, а закрытое
        // соединение навсегда осталось бы со скоростью последнего живого кадра.
        const stopped = gone.map((row) => ({ ...row, downRate: 0, upRate: 0 }));

        return {
          active: rows,
          index: next,
          sampledAt: receivedAt,
          summary: toSummary(rows),
          history,
          closed: gone.length > 0 ? [...stopped, ...state.closed].slice(0, CLOSED_LIMIT) : state.closed,
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
    reset: () => {
      set({
        active: [],
        index: new Map(),
        closed: [],
        totals: EMPTY_TOTALS,
        summary: EMPTY_SUMMARY,
        history: [],
        paused: false,
        dropped: 0,
        sampledAt: null,
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
