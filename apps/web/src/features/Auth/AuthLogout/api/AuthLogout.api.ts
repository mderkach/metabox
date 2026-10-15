import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AUTH_QUERY, getAuthOptions, LOGGED_OUT, postLogout } from '@entities/Auth';

/** The cache of the closed session is dropped: the config with node secrets would otherwise stay in memory behind the login screen. */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => postLogout(),
    meta: { showError: true, errorMessageKey: 'toast.auth.logout.failed' },
    onSuccess: () => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY.all[0] });
      queryClient.setQueryData(getAuthOptions().queryKey, LOGGED_OUT);
    },
  });
}
