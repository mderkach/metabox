import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';

import type { ConnectionsSnapshotDto } from '../api/Connection.dto';
import { toConnectionRow } from './Connection.mapper';
import { CLOSED_LIMIT, type ConnectionRow, type ConnectionTotals } from './Connection.model';

const EMPTY_TOTALS: ConnectionTotals = { upload: 0, download: 0, memory: 0 };

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
  apply: (snapshot: ConnectionsSnapshotDto) => void;
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
    apply: (snapshot) => {
      set((state) => {
        if (state.paused) {
          return;
        }

        const next = new Map<string, ConnectionRow>();

        const rows = snapshot.connections.map((connection) => {
          const previous = state.index.get(connection.id);
          // Неизменившаяся строка отдаётся прежним объектом: иначе `memo` на
          // строке списка не спасает — пропс был бы новым каждый снапшот.
          // Сверка идёт по снапшоту, до разбора: на пяти тысячах соединений
          // (NFR-2) собирать строку, чтобы тут же её выбросить, — основная
          // работа обработчика, а меняются у большинства только счётчики байт.
          const kept =
            previous !== undefined &&
            previous.upload === connection.upload &&
            previous.download === connection.download;
          const row = kept ? previous : toConnectionRow(connection);

          next.set(row.id, row);

          return row;
        });

        const gone = state.active.filter((row) => !next.has(row.id));

        state.active = rows;
        state.index = next;

        if (gone.length > 0) {
          state.closed = [...gone, ...state.closed].slice(0, CLOSED_LIMIT);
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
