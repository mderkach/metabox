import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteSession, getSessionsOptions } from '@entities/Auth';
import { ApiError } from '@shared/api';

/** How an end request finished when it did not fail. */
export const END_SESSION_RESULT = {
  Ended: 'ended',
  // The daemon closed the session, but its session file was not written: a daemon restart brings it back.
  NotSaved: 'notSaved',
} as const;

export type EndSessionResult = (typeof END_SESSION_RESULT)[keyof typeof END_SESSION_RESULT];

const NOT_SAVED_CODE = 'logout_not_saved';

/**
 * Ends another panel session. The list is reread whatever the answer: a session that ended
 * meanwhile answers 404 and leaves the list just the same. An unsaved revocation is a result,
 * not a failure: the session is gone from the list, and "could not end" would contradict it.
 */
export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<EndSessionResult> => {
      try {
        await deleteSession(id);
      } catch (error) {
        if (error instanceof ApiError && error.code === NOT_SAVED_CODE) {
          return END_SESSION_RESULT.NotSaved;
        }

        throw error;
      }

      return END_SESSION_RESULT.Ended;
    },
    meta: { showError: true, errorMessageKey: 'toast.auth.session.endFailed' },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: getSessionsOptions().queryKey }),
  });
}
