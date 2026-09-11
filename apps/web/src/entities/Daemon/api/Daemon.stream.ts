import type { StreamSocket } from '@shared/api';

import { RuntimeStore } from '../model/Daemon.store';
import type { ClashMemorySample, ClashTrafficSample } from './Daemon.dto';

/**
 * Потоки трафика и памяти отдают по одному маленькому сэмплу в секунду,
 * поэтому копить их пачкой незачем: пачка нужна там, где сообщение — снапшот
 * на тысячи объектов.
 */
function listen<T>(socket: StreamSocket, apply: (sample: T) => void): () => void {
  const onMessage = (event: MessageEvent<string>) => {
    try {
      // Сэмпл — два числа; проверять его схемой дороже, чем разобрать.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- см. выше
      apply(JSON.parse(event.data) as T);
    } catch {
      // Битый кадр пропускается: следующий придёт через секунду.
    }
  };

  socket.addEventListener('message', onMessage);

  return () => {
    socket.removeEventListener('message', onMessage);
  };
}

export function listenTraffic(socket: StreamSocket): () => void {
  return listen<ClashTrafficSample>(socket, (sample) => {
    RuntimeStore.getState().pushTraffic(sample);
  });
}

export function listenMemory(socket: StreamSocket): () => void {
  return listen<ClashMemorySample>(socket, (sample) => {
    RuntimeStore.getState().pushMemory(sample);
  });
}
