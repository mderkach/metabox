import { createReactSelectors, stateCreator } from '@shared/lib/state';

import { LOG_LIMIT, LOG_STREAM_STATUS, type LogEntry, type LogEvent, type LogStreamStatus } from './Log.model';

interface LogState {
  /** Lines that came through the stream after the tail: a ring of `LOG_LIMIT`, old ones first. */
  entries: LogEntry[];
  /** How many lines the daemon dropped for a slow reader, by a `seq` gap. */
  lost: number;
  /** What the next `seq` should be; `null` means the connection is new, numbers start over. */
  expected: number | null;
  status: LogStreamStatus;
  append: (events: readonly LogEvent[]) => void;
  /**
   * The connection opened. Numbers in the daemon are per connection, and lines
   * that came before it will no longer arrive through the stream: the screen
   * rereads the tail, and lines of the previous connection are removed so as
   * not to double.
   */
  restart: () => void;
  setStatus: (status: LogStreamStatus) => void;
  /** New level or clear: the screen starts from a clean tail. */
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
