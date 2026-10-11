import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { decodeFrame, type StreamSource } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

import { toLogEntry } from '../model/Log.adapter';
import { LOG_STREAM_STATUS, type LogEvent, type LogLevel } from '../model/Log.model';
import { LogStore } from '../model/Log.store';
import { LOG_ENDPOINT } from './Log.endpoints';
import { LOG_QUERY } from './Log.query';
import { LogEventSchema } from './Log.schema';

/** Имя события SSE у потока лога. */
const LOG_EVENT = 'log';

/**
 * Строки копятся и уходят в стор пачкой: на уровне `debug` sing-box пишет
 * сотни строк в секунду, и рендер на каждую занял бы главный поток целиком.
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
 * Подписка на строки потока лога. Возвращает функцию отписки; строки, не
 * успевшие уйти пачкой, при отписке выбрасываются — экран уже закрыт.
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

const RECONNECT_MAX_SECONDS = 30;
const RECONNECT_GROWTH = 2;

/**
 * Повтор потока, которому демон отказал или который оборвался насовсем:
 * задержка растёт вдвое от `FirstDelay` до `MaxDelay`, после `Attempts`
 * неудач подряд экран ждёт ручного переподключения. Отказ лимита потоков
 * снимается, когда закрывается чужой поток, а лог, недоступный минуту, без
 * владельца роутера уже не поднимется.
 */
export const LOG_RECONNECT = {
  FirstDelay: MS_IN_SECOND,
  MaxDelay: RECONNECT_MAX_SECONDS * MS_IN_SECOND,
  Attempts: 6,
} as const;

function reconnectDelay(failures: number): number {
  return Math.min(LOG_RECONNECT.FirstDelay * RECONNECT_GROWTH ** failures, LOG_RECONNECT.MaxDelay);
}

/**
 * Поток лога открыт, пока смонтирован экран, который его зовёт. В отличие от
 * `/api/events` поток у демона свой на каждого читателя — процесс `logread -f`
 * или опрос файла — и их не больше четырёх, поэтому держать его в оболочке
 * на всех экранах нельзя.
 *
 * Уровень уходит в адрес потока: смена уровня закрывает поток и открывает
 * новый. Обрыв `EventSource` переподключает сам; поток, которому демон
 * отказал, хук открывает заново по `LOG_RECONNECT`, а исчерпав попытки, ждёт
 * `reconnect`.
 *
 * На скрытой вкладке поток закрыт: фоновые вкладки иначе разбирают все четыре
 * места у демона, и экран логов на видимой получает отказ. Вкладка, снова
 * ставшая видимой, открывает поток заново.
 *
 * Хвост перечитывается на каждом открытии потока, включая первое: хвост,
 * взятый раньше потока, теряет строки между ними. Начало потока, которое
 * хвост успел захватить, снимает `mergeLogEntries`.
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

        if (failures >= LOG_RECONNECT.Attempts) {
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
        // Строки закрытого потока не должны мелькнуть на следующем открытии экрана.
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
