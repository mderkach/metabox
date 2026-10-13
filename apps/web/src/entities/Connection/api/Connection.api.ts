import { ApiClientInstance, listenTopic, RUNTIME_TOPIC, type StreamSource } from '@shared/api';

import { ConnectionStore } from '../model/Connection.store';
import { CONNECTION_ENDPOINT } from './Connection.endpoints';

/**
 * Snapshots are applied in a batch on a timer, not on every event: on reconnect
 * the stream sends the current state right on top of the next snapshot, and
 * applying each would give extra passes over 5000 objects. Only the last one
 * accumulates; the previous one is replaced entirely.
 */
const APPLY_INTERVAL = 500;

export async function closeConnection(id: string): Promise<void> {
  await ApiClientInstance.delete<void>(CONNECTION_ENDPOINT.connection(id));
}

export async function closeAllConnections(): Promise<void> {
  await ApiClientInstance.delete<void>(CONNECTION_ENDPOINT.connections());
}

/**
 * Subscription to the connections topic. Returns an unsubscribe function:
 * without it the handler would outlive unmounting, and every reopening of the
 * screen would add one more parse of the same snapshots.
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
