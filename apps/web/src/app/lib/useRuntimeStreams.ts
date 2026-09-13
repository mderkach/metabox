import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ConnectionState, listenConnections } from '@entities/Connection';
import {
  DAEMON_ENDPOINT,
  DAEMON_QUERY,
  getServiceStateOptions,
  listenMemory,
  listenService,
  listenSystem,
  listenTraffic,
  RuntimeState,
} from '@entities/Daemon';
import { watchSequence } from '@shared/api';

/**
 * Единый поток рантайма живёт в оболочке, а не на экранах: экран объявляет,
 * что смотрит поток, а открывает и закрывает его одно место. Иначе
 * переоткрытие экрана заводило бы ещё одну подписку поверх прежней.
 *
 * Поток один на все топики (ADR-0010): трафик, память, соединения и состояние
 * службы приходят конвертом демона, а не тремя сокетами к Clash API.
 */
export function useRuntimeStreams(): void {
  const queryClient = useQueryClient();
  // Селекторы вызываются порознь: `||` закоротил бы второй хук, и порядок
  // хуков поехал бы между рендерами.
  const connectionReaders = ConnectionState.use.readers();
  const runtimeReaders = RuntimeState.use.readers();
  const active = connectionReaders > 0 || runtimeReaders > 0;

  useEffect(
    function openRuntimeStream() {
      if (!active) {
        return undefined;
      }

      const source = new EventSource(DAEMON_ENDPOINT.events());

      // Переподключение и разрыв в номерах значат одно: часть событий прошла
      // мимо панели. Соединения догонит следующий снапшот, а состояние службы
      // и статус демона живут в кэше — их перечитываем (ADR-0010).
      function refetchRuntime() {
        void queryClient.invalidateQueries({ queryKey: DAEMON_QUERY.all });
      }

      // Первое открытие переподключением не считается: данные только что
      // запрошены, и инвалидация сходила бы к демону впустую.
      let opened = false;

      function onStreamOpen() {
        if (opened) {
          refetchRuntime();
        }

        opened = true;
      }

      source.addEventListener('open', onStreamOpen);

      const unsubscribe = [
        watchSequence(source, refetchRuntime),
        listenTraffic(source),
        listenMemory(source),
        listenSystem(source),
        listenConnections(source),
        // Состояние службы в потоке и в ручке — одно тело, поэтому событие
        // кладётся в кэш запроса: карточка службы читает его своим хуком и не
        // знает, пришло оно потоком или запросом.
        listenService(source, (state) => {
          queryClient.setQueryData(getServiceStateOptions().queryKey, state);
        }),
      ];

      return function closeRuntimeStream() {
        for (const off of unsubscribe) off();

        source.removeEventListener('open', onStreamOpen);
        source.close();
      };
    },
    [active, queryClient]
  );
}
