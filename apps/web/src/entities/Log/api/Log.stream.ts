import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { decodeFrame, type StreamSource } from '@shared/api';

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

/**
 * Поток лога открыт, пока смонтирован экран, который его зовёт. В отличие от
 * `/api/events` поток у демона свой на каждого читателя — процесс `logread -f`
 * или опрос файла — и их не больше четырёх, поэтому держать его в оболочке
 * на всех экранах нельзя.
 *
 * Уровень уходит в адрес потока: смена уровня закрывает поток и открывает
 * новый. Обрыв `EventSource` переподключает сам; поток, которому демон
 * отказал, остаётся закрытым до `reconnect`.
 */
export function useLogStream(level: LogLevel): { reconnect: () => void } {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);

  useEffect(
    function openLogStream() {
      const store = LogStore.getState();
      const source = new EventSource(`${LOG_ENDPOINT.stream()}?${new URLSearchParams({ level }).toString()}`);
      let opened = false;

      store.reset();
      store.setStatus(LOG_STREAM_STATUS.Connecting);

      function onStreamOpen() {
        // Переподключение: строки обрыва потоком не придут, их отдаст хвост.
        if (opened) {
          store.restart();
          void queryClient.invalidateQueries({ queryKey: LOG_QUERY.tail(level) });
        }

        opened = true;
        store.setStatus(LOG_STREAM_STATUS.Open);
      }

      function onStreamError() {
        store.setStatus(
          source.readyState === EventSource.CLOSED ? LOG_STREAM_STATUS.Closed : LOG_STREAM_STATUS.Connecting
        );
      }

      source.addEventListener('open', onStreamOpen);
      source.addEventListener('error', onStreamError);

      const unsubscribe = listenLog(source);

      return function closeLogStream() {
        unsubscribe();
        source.removeEventListener('open', onStreamOpen);
        source.removeEventListener('error', onStreamError);
        source.close();
        // Строки закрытого потока не должны мелькнуть на следующем открытии экрана.
        store.reset();
      };
    },
    [attempt, level, queryClient]
  );

  const reconnect = useCallback(() => {
    setAttempt((value) => value + 1);
    void queryClient.invalidateQueries({ queryKey: LOG_QUERY.tail(level) });
  }, [level, queryClient]);

  return { reconnect };
}
