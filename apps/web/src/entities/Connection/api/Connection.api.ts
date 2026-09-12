import { ApiClientInstance, listenTopic, RUNTIME_TOPIC, type StreamSource } from '@shared/api';

import { ConnectionStore } from '../model/Connection.store';
import { CONNECTION_ENDPOINT } from './Connection.endpoints';

/**
 * Снапшоты применяются пачкой по таймеру, а не на каждое событие: при
 * переподключении поток присылает текущее состояние сразу поверх очередного
 * снапшота, и применение каждого дало бы лишние проходы по 5000 объектов
 * (NFR-2). Копится только последний — предыдущий замещается целиком.
 */
const APPLY_INTERVAL = 500;

export async function closeConnection(id: string): Promise<void> {
  await ApiClientInstance.delete<void>(CONNECTION_ENDPOINT.connection(id));
}

export async function closeAllConnections(): Promise<void> {
  await ApiClientInstance.delete<void>(CONNECTION_ENDPOINT.connections());
}

/**
 * Подписка на топик соединений. Возвращает функцию отписки: без неё обработчик
 * переживёт размонтирование, и каждое переоткрытие экрана добавляло бы ещё
 * один разбор тех же снапшотов.
 */
export function listenConnections(source: StreamSource): () => void {
  let pending: unknown = null;

  const flush = () => {
    if (pending === null) {
      return;
    }

    const snapshot = pending;
    pending = null;

    ConnectionStore.getState().apply(snapshot);
  };

  const timer = setInterval(flush, APPLY_INTERVAL);

  const unsubscribe = listenTopic(source, RUNTIME_TOPIC.Connections, (snapshot) => {
    pending = snapshot;
  });

  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
