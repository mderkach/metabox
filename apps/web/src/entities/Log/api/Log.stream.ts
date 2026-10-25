import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { decodeFrame, reconnectDelay, STREAM_RECONNECT, type StreamSource } from '@shared/api';

import { toLogEntry } from '../model/Log.adapter';
import { LOG_STREAM_STATUS, type LogEvent, type LogLevel } from '../model/Log.model';
import { LogStore } from '../model/Log.store';
import { LOG_ENDPOINT } from './Log.endpoints';
import { LOG_QUERY } from './Log.query';
import { LogEventSchema } from './Log.schema';

/** SSE event name of the log stream. */
const LOG_EVENT = 'log';

/**
 * Lines accumulate and go to the store in a batch: at the `debug` level
 * sing-box writes hundreds of lines per second, and a render for each would
 * take the main thread entirely.
 */
const LOG_FLUSH_MS = 100;

function parseFrame(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Subscription to log stream lines. Returns an unsubscribe function; lines that
 * did not manage to go out in a batch are dropped on unsubscribe, since the
 * screen is already closed.
 */
export function listenLog(source: StreamSource): () => void {
  let pending: LogEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flushLog() {
    timer = null;
    LogStore.getState().append(pending);
    pending = [];
  }

  function onLog(event: MessageEvent<string>) {
    const frame = decodeFrame(LogEventSchema, parseFrame(event.data), LOG_EVENT);

    if (frame === null) {
      return;
    }

    pending.push({ seq: frame.seq, entry: toLogEntry(frame.entry) });
    timer ??= setTimeout(flushLog, LOG_FLUSH_MS);
  }

  source.addEventListener(LOG_EVENT, onLog);

  return () => {
    source.removeEventListener(LOG_EVENT, onLog);

    if (timer !== null) {
      clearTimeout(timer);
    }
  };
}

/**
 * The log stream is open while the screen that calls it is mounted. Unlike
 * `/api/events`, the daemon has its own stream for every reader, a `logread -f`
 * process or file polling, and there are no more than four of them, so it
 * cannot be held in the shell for all screens.
 *
 * The level goes into the stream address: a level change closes the stream and
 * opens a new one. `EventSource` reconnects on a break by itself; a stream the
 * daemon refused is reopened by the hook per `STREAM_RECONNECT`, and after
 * exhausting the attempts it waits for
 * `reconnect`.
 *
 * On a hidden tab the stream is closed: background tabs would otherwise take
 * all four daemon slots, and the log screen on the visible one would be
 * refused. A tab that becomes visible again opens the stream anew.
 *
 * The tail is reread on every stream open, including the first: a tail taken
 * before the stream loses lines between them. The beginning of the stream that
 * the tail managed to capture is removed by `mergeLogEntries`.
 */
export function useLogStream(level: LogLevel): { reconnect: () => void } {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);

  useEffect(
    function openLogStream() {
      const store = LogStore.getState();
      const url = `${LOG_ENDPOINT.stream()}?${new URLSearchParams({ level }).toString()}`;
      let source: EventSource | null = null;
      let unsubscribe: (() => void) | null = null;
      let retry: ReturnType<typeof setTimeout> | null = null;
      let failures = 0;

      function onStreamOpen() {
        failures = 0;
        store.restart();
        store.setStatus(LOG_STREAM_STATUS.Open);
        void queryClient.invalidateQueries({ queryKey: LOG_QUERY.tail(level) });
      }

      function onStreamError() {
        if (source?.readyState !== EventSource.CLOSED) {
          store.setStatus(LOG_STREAM_STATUS.Connecting);

          return;
        }

        disconnect();

        if (failures >= STREAM_RECONNECT.Attempts) {
          store.setStatus(LOG_STREAM_STATUS.Closed);

          return;
        }

        retry = setTimeout(connect, reconnectDelay(failures));
        failures += 1;
        store.setStatus(LOG_STREAM_STATUS.Reconnecting);
      }

      function connect() {
        retry = null;
        source = new EventSource(url);
        source.addEventListener('open', onStreamOpen);
        source.addEventListener('error', onStreamError);
        unsubscribe = listenLog(source);
      }

      function disconnect() {
        unsubscribe?.();
        unsubscribe = null;
        source?.removeEventListener('open', onStreamOpen);
        source?.removeEventListener('error', onStreamError);
        source?.close();
        source = null;
      }

      function cancelRetry() {
        if (retry !== null) {
          clearTimeout(retry);
          retry = null;
        }
      }

      function onVisibilityChange() {
        if (document.hidden) {
          cancelRetry();
          disconnect();

          return;
        }

        if (source === null && retry === null) {
          failures = 0;
          store.setStatus(LOG_STREAM_STATUS.Connecting);
          connect();
        }
      }

      store.reset();
      store.setStatus(LOG_STREAM_STATUS.Connecting);
      connect();
      document.addEventListener('visibilitychange', onVisibilityChange);

      return function closeLogStream() {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        cancelRetry();
        disconnect();
        // Lines of a closed stream must not flash on the next screen open.
        store.reset();
      };
    },
    [attempt, level, queryClient]
  );

  const reconnect = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { reconnect };
}
