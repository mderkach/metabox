import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ConnectionState, listenConnections } from '@entities/Connection';
import { DAEMON_QUERY, listenMemory, listenService, listenTraffic, RuntimeState } from '@entities/Daemon';
import { DAEMON_ENDPOINT } from '@entities/Daemon';

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

      const unsubscribe = [
        listenTraffic(source),
        listenMemory(source),
        listenConnections(source),
        // Состояние службы в потоке и в ручке — одно тело, поэтому событие
        // кладётся в кэш запроса: карточка службы читает его своим хуком и не
        // знает, пришло оно потоком или запросом.
        listenService(source, (state) => {
          queryClient.setQueryData(DAEMON_QUERY.service(), state);
        }),
      ];

      return function closeRuntimeStream() {
        for (const off of unsubscribe) off();

        source.close();
      };
    },
    [active, queryClient]
  );
}
