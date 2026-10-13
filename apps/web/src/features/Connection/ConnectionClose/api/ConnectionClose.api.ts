import { useMutation } from '@tanstack/react-query';

import { closeAllConnections, closeConnection } from '@entities/Connection';

export function useCloseConnection() {
  return useMutation({
    mutationFn: closeConnection,
    meta: { showError: true, errorMessageKey: 'toast.connection.close.failed' },
  });
}

/**
 * Closing all live connections. There is no success toast, as for closing one:
 * the result is visible in the rows that left the list, and a live region of
 * the screen announces it to a screen reader. A `sonner` toast would announce
 * it a second time.
 */
export function useCloseAllConnections() {
  return useMutation({
    mutationFn: closeAllConnections,
    meta: { showError: true, errorMessageKey: 'toast.connection.close.failed' },
  });
}
