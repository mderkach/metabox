import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getAuthOptions, LOGGED_IN, postLogin } from '@entities/Auth';

/**
 * Login. A failure is shown in the form, not as a toast: the user is looking at the
 * password field.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (password: string) => postLogin(password),
    onSuccess: () => {
      queryClient.setQueryData(getAuthOptions().queryKey, LOGGED_IN);
    },
  });
}
