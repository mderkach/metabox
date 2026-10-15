import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getAuthOptions, LOGGED_OUT } from '@entities/Auth';
import { isSessionLost } from '@shared/api';

/**
 * A session ends on the daemon side: it expired, the password was changed in another browser,
 * the daemon restarted. The panel learns it from a 401 on any request, so the watch sits on both
 * caches, not on each query: the first such answer switches the shell to the login screen.
 */
export function useSessionWatch(): void {
  const queryClient = useQueryClient();

  useEffect(
    function watchSession() {
      function onFailure(error: unknown) {
        if (isSessionLost(error)) {
          queryClient.setQueryData(getAuthOptions().queryKey, LOGGED_OUT);
        }
      }

      const stopQueries = queryClient.getQueryCache().subscribe(function onQueryEvent(event) {
        if (event.type === 'updated' && event.action.type === 'error') {
          onFailure(event.action.error);
        }
      });

      const stopMutations = queryClient.getMutationCache().subscribe(function onMutationEvent(event) {
        if (event.type === 'updated' && event.action.type === 'error') {
          onFailure(event.action.error);
        }
      });

      return function stopWatchingSession() {
        stopQueries();
        stopMutations();
      };
    },
    [queryClient]
  );
}
