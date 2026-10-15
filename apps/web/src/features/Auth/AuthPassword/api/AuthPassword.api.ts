import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getAuthOptions, LOGGED_IN, OPEN_PANEL, putPassword } from '@entities/Auth';

/**
 * Set or change the password. The daemon closes every session and gives this browser a new one,
 * so the panel stays open here and asks for login everywhere else.
 */
export function useSetPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ current, password }: { current: string; password: string }) =>
      putPassword({ current, password }),
    meta: { showSuccess: true, successMessageKey: 'toast.auth.password.saved' },
    onSuccess: () => {
      queryClient.setQueryData(getAuthOptions().queryKey, LOGGED_IN);
    },
  });
}

/** Remove the password: the panel becomes open to every device that reaches it. */
export function useRemovePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (current: string) => putPassword({ current, password: '' }),
    meta: { showSuccess: true, successMessageKey: 'toast.auth.password.removed' },
    onSuccess: () => {
      queryClient.setQueryData(getAuthOptions().queryKey, OPEN_PANEL);
    },
  });
}
