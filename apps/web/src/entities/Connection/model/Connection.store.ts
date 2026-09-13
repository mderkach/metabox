import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';
import { MS_IN_SECOND } from '@shared/lib/time';

import { toConnectionRow, toConnectionsSnapshot } from './Connection.adapter';
import { CLOSED_LIMIT, type ConnectionRate, type ConnectionRow, type ConnectionTotals } from './Connection.model';

const EMPTY_TOTALS: ConnectionTotals = { upload: 0, download: 0, memory: 0 };
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
