import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

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
  useDaemonInstance,
} from '@entities/Daemon';
import { isSessionLost, reconnectDelay, watchSequence } from '@shared/api';

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
  const instance = useDaemonInstance();
  const reopen = useRef<(() => void) | null>(null);
  const seenInstance = useRef(instance);

  useEffect(
    function openRuntimeStream() {
      if (!active) {
        return undefined;
      }

      // A reconnect and a gap in sequence numbers mean the same: some events
      // missed the panel. Connections catch up with the next snapshot, while
      // the service state and the daemon status live in the cache, so they are
      // refetched.
      function refetchRuntime() {
        void queryClient.invalidateQueries({ queryKey: DAEMON_QUERY.all });
      }

      let source: EventSource | null = null;
      let unsubscribe: (() => void)[] = [];
      let retry: ReturnType<typeof setTimeout> | null = null;
      let failures = 0;
      let stopped = false;
      // The first open does not count as a reconnect: the data was just
      // requested, and invalidation would go to the daemon for nothing.
      let opened = false;

      function onStreamOpen() {
        failures = 0;

        if (opened) {
          refetchRuntime();
        }

        opened = true;
      }

      // The browser hides the status of a refused stream, and after a daemon restart or a
      // logout elsewhere the refusal is a 401. A status request tells it at once: its 401
      // reaches the session watch, which shows the login screen without waiting for a poll,
      // and any other failure reaches the banner. A closed source is never reopened by the
      // browser (a 502/503 from a proxy, a refused connection, the reader limit), so the
      // hook reopens it per `STREAM_RECONNECT`; a lost session is not retried.
      function onStreamError() {
        if (source?.readyState !== EventSource.CLOSED) {
          return;
        }

        disconnect();
        retry ??= setTimeout(connect, reconnectDelay(failures));
        failures += 1;

        queryClient.fetchQuery({ ...getDaemonStatusOptions(), staleTime: 0 }).catch(function stopOnLostSession(
          error: unknown
        ) {
          // Any other failure is already in the query cache, where the banner reads it.
          if (isSessionLost(error)) {
            stopped = true;
            cancelRetry();
          }
        });
      }

      function connect() {
        retry = null;

        if (stopped) {
          return;
        }

        source = new EventSource(DAEMON_ENDPOINT.events());
        source.addEventListener('open', onStreamOpen);
        source.addEventListener('error', onStreamError);
        unsubscribe = [
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
      }

      function disconnect() {
        for (const off of unsubscribe) off();

        unsubscribe = [];
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

      // A restarted daemon is back, while the retry may still be counting down a
      // pause grown during its silence: the stream opens now, not in half a minute.
      reopen.current = function reopenStream() {
        if (stopped || (source !== null && source.readyState !== EventSource.CLOSED)) {
          return;
        }

        cancelRetry();
        disconnect();
        failures = 0;
        connect();
      };

      connect();

      return function closeRuntimeStream() {
        reopen.current = null;
        stopped = true;
        cancelRetry();
        disconnect();
        RuntimeStore.getState().closeStream();
      };
    },
    [active, queryClient]
  );

  useEffect(
    function reopenOnNewDaemon() {
      const previous = seenInstance.current;

      seenInstance.current = instance;

      if (previous !== undefined && instance !== undefined && previous !== instance) {
        reopen.current?.();
      }
    },
    [instance]
  );
}
