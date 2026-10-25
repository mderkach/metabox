import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AUTH_QUERY, getAuthOptions, LOGGED_OUT, postLogout } from '@entities/Auth';
import { ConfigDocumentStore } from '@entities/Config';

/**
 * Closes the session and leaves no config behind the login screen: every
 * query but the login state is dropped from the cache, the document store
 * forgets the applied text and the draft, and with it the draft record
 * leaves the browser storage.
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => postLogout(),
    meta: { showError: true, errorMessageKey: 'toast.auth.logout.failed' },
    onSuccess: () => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY.all[0] });
      queryClient.setQueryData(getAuthOptions().queryKey, LOGGED_OUT);
      ConfigDocumentStore.getState().reset();
    },
  });
}
