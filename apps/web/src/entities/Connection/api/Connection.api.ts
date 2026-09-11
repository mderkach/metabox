import { API_ENDPOINT, ApiClientInstance, type StreamSocket } from '@shared/api';

import { ConnectionStore } from '../model/Connection.store';
import type { ClashConnectionsSnapshot } from './Connection.dto';

/**
 * Снапшоты применяются пачкой по таймеру, а не на каждое сообщение: поток
 * отдаёт полный список раз в секунду, а при переподключении присылает его
 * сразу, и построчное применение дало бы лишние проходы по 5000 объектов.
 */
const APPLY_INTERVAL = 500;

export async function closeConnection(id: string): Promise<void> {
  await ApiClientInstance.delete<void>(API_ENDPOINT.clashConnection(id));
}

export async function closeAllConnections(): Promise<void> {
  await ApiClientInstance.delete<void>(API_ENDPOINT.clashConnections());
}

/**
 * Подписка на поток соединений. Возвращает функцию отписки: без неё сокет
 * переживёт размонтирование, и каждое переоткрытие экрана добавляло бы ещё
 * один поток снапшотов.
 */
export function listenConnections(socket: StreamSocket): () => void {
  let pending: string | null = null;

  const flush = () => {
    if (pending === null) {
      return;
    }

    const frame = pending;
    pending = null;

    try {
      // Схемой поток не проверяется намеренно: разбор 5000 объектов Zod'ом
      // раз в секунду и есть та работа, которую запрещает NFR-2.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- см. выше
      ConnectionStore.getState().apply(JSON.parse(frame) as ClashConnectionsSnapshot);
    } catch {
      // Битый кадр пропускается: поток идёт дальше, следующий снапшот полный.
    }
  };

  const timer = setInterval(flush, APPLY_INTERVAL);

  const onMessage = (event: MessageEvent<string>) => {
    // Копится только последний кадр, и разбирается он один раз при выгрузке:
    // снапшот весит десятки килобайт, а предыдущий замещается целиком.
    pending = event.data;
  };

  socket.addEventListener('message', onMessage);

  return () => {
    clearInterval(timer);
    socket.removeEventListener('message', onMessage);
  };
}
