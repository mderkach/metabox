import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteSession, getSessionsOptions } from '@entities/Auth';

/**
 * Ends another panel session. The list is reread whatever the answer: a session that ended
 * meanwhile answers 404 and leaves the list just the same.
 */
export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => deleteSession(id),
    meta: { showError: true, errorMessageKey: 'toast.auth.session.endFailed' },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: getSessionsOptions().queryKey }),
  });
}
