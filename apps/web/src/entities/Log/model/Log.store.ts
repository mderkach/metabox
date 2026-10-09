import { createReactSelectors, stateCreator } from '@shared/lib/state';

import { LOG_LIMIT, LOG_STREAM_STATUS, type LogEntry, type LogEvent, type LogStreamStatus } from './Log.model';

interface LogState {
  /** Строки, пришедшие потоком после хвоста: кольцо на `LOG_LIMIT`, старые первыми. */
  entries: LogEntry[];
  /** Сколько строк демон отбросил медленному читателю — по разрыву `seq`. */
  lost: number;
  /** Каким должен быть следующий `seq`; `null` — соединение новое, номера начинаются заново. */
  expected: number | null;
  status: LogStreamStatus;
  append: (events: readonly LogEvent[]) => void;
  /**
   * Соединение открылось заново. Номера у демона считаются на соединение, а
   * строки, пришедшие за время обрыва, потоком уже не доедут: экран
   * перечитывает хвост, а строки потока снимаются, чтобы не задвоиться.
   */
  restart: () => void;
  setStatus: (status: LogStreamStatus) => void;
  /** Новый уровень или очистка: экран начинает с чистого хвоста. */
  reset: () => void;
}

const INITIAL = {
  entries: [],
  lost: 0,
  expected: null,
  status: LOG_STREAM_STATUS.Connecting,
} satisfies Partial<LogState>;

const LogStateProto = stateCreator<LogState>(
  (set) => ({
    ...INITIAL,
    append: (events) => {
      set((state) => {
        if (events.length === 0) {
          return state;
        }

        let { expected, lost } = state;

        for (const event of events) {
          if (expected !== null && event.seq > expected) {
            lost += event.seq - expected;
          }

          expected = event.seq + 1;
        }

        return {
          entries: [...state.entries, ...events.map((event) => event.entry)].slice(-LOG_LIMIT),
          expected,
          lost,
        };
      });
    },
    restart: () => {
      set({ entries: [], expected: null });
    },
    setStatus: (status) => {
      set({ status });
    },
    reset: () => {
      set({ entries: [], lost: 0, expected: null });
    },
  }),
  'LogStream'
);

export const LogState = createReactSelectors(LogStateProto);

export const LogStore = LogStateProto;
