import { queryOptions, useQuery } from '@tanstack/react-query';

import { decodeResponse } from '@shared/api';

import { getAuth } from './Auth.api';
import { AuthSchema } from './Auth.schema';

export const AUTH_QUERY = {
  all: ['auth'] as const,
  state: () => [...AUTH_QUERY.all, 'state'] as const,
} as const;

/**
 * Login state. It is not polled: a lost session shows itself with a 401 on the next request,
 * and the shell puts the logged-out state into this cache. Without a failure toast: the shell
 * shows the panel when the daemon does not know this address, and the daemon banner reports
 * unavailability.
 */
export function getAuthOptions() {
  return queryOptions({
    queryKey: AUTH_QUERY.state(),
    queryFn: async (context) => decodeResponse(AuthSchema, await getAuth(context), 'auth'),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useAuth() {
  return useQuery(getAuthOptions());
}
