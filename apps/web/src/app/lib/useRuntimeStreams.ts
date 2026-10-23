import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ConnectionState, listenConnections } from '@entities/Connection';
import {
  DAEMON_ENDPOINT,
  DAEMON_QUERY,
  getDaemonStatusOptions,
  getServiceStateOptions,
  listenMemory,
  listenService,
  listenSystem,
  listenTraffic,
  RuntimeState,
  RuntimeStore,
} from '@entities/Daemon';
import { watchSequence } from '@shared/api';

/**
 * The single runtime stream lives in the shell, not on screens: a screen
 * declares that it watches the stream, and one place opens and closes it.
 * Otherwise reopening a screen would create one more subscription on top of the
 * previous one.
 *
 * One stream serves all topics: traffic, memory, connections and service state
 * arrive in the daemon envelope, not through three sockets to the Clash API.
 */
export function useRuntimeStreams(): void {
  const queryClient = useQueryClient();
  // Selectors are called separately: `||` would short-circuit the second hook
  // and the hook order would shift between renders.
  const connectionReaders = ConnectionState.use.readers();
  const runtimeReaders = RuntimeState.use.readers();
  const active = connectionReaders > 0 || runtimeReaders > 0;

  useEffect(
    function openRuntimeStream() {
      if (!active) {
        return undefined;
      }

      const source = new EventSource(DAEMON_ENDPOINT.events());

      // A reconnect and a gap in sequence numbers mean the same: some events
      // missed the panel. Connections catch up with the next snapshot, while
      // the service state and the daemon status live in the cache, so they are
      // refetched.
      function refetchRuntime() {
        void queryClient.invalidateQueries({ queryKey: DAEMON_QUERY.all });
      }

      // The first open does not count as a reconnect: the data was just
      // requested, and invalidation would go to the daemon for nothing.
      let opened = false;

      function onStreamOpen() {
        if (opened) {
          refetchRuntime();
        }

        opened = true;
      }

      source.addEventListener('open', onStreamOpen);

      // The browser hides the status of a refused stream, and after a daemon restart or a
      // logout elsewhere the refusal is a 401. A status request tells it at once: its 401
      // reaches the session watch, which shows the login screen without waiting for a poll.
      function onStreamError() {
        if (source.readyState !== EventSource.CLOSED) {
          return;
        }

        void queryClient.fetchQuery({ ...getDaemonStatusOptions(), staleTime: 0 }).catch(function ignoreProbeFailure() {
          // The failure is already in the query cache, where the session watch and the banner read it.
        });
      }

      source.addEventListener('error', onStreamError);

      const unsubscribe = [
        watchSequence(source, refetchRuntime),
        listenTraffic(source),
        listenMemory(source),
        listenSystem(source),
        listenConnections(source),
        // The service state in the stream and in the endpoint is the same body,
        // so the event is put into the query cache: the service card reads it
        // with its own hook and does not know whether it came from the stream
        // or from a request.
        listenService(source, (state) => {
          queryClient.setQueryData(getServiceStateOptions().queryKey, state);
        }),
      ];

      return function closeRuntimeStream() {
        for (const off of unsubscribe) off();

        source.removeEventListener('open', onStreamOpen);
        source.removeEventListener('error', onStreamError);
        source.close();
        RuntimeStore.getState().closeStream();
      };
    },
    [active, queryClient]
  );
}
