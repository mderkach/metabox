import { useEffect } from 'react';

import { ConnectionState, listenConnections } from '@entities/Connection';
import { listenMemory, listenTraffic, RuntimeState } from '@entities/Daemon';
import { API_ENDPOINT, toWebSocketUrl } from '@shared/api';

/**
 * Сокеты рантайма живут в оболочке, а не на экранах: экран объявляет, что
 * смотрит поток, а открывает и закрывает его одно место. Иначе переоткрытие
 * экрана заводило бы ещё один поток снапшотов поверх прежнего.
 */
export function useRuntimeStreams(): void {
  useStream(ConnectionState.use.readers() > 0, API_ENDPOINT.clashConnections(), listenConnections);
  useStream(RuntimeState.use.readers() > 0, API_ENDPOINT.clashTraffic(), listenTraffic);
  useStream(RuntimeState.use.readers() > 0, API_ENDPOINT.clashMemory(), listenMemory);
}

function useStream(active: boolean, path: string, listen: (socket: WebSocket) => () => void): void {
  useEffect(
    function openStream() {
      if (!active) {
        return;
      }

      const socket = new WebSocket(toWebSocketUrl(path));
      const unsubscribe = listen(socket);

      return function closeStream() {
        unsubscribe();
        socket.close();
      };
    },
    [active, path, listen]
  );
}
