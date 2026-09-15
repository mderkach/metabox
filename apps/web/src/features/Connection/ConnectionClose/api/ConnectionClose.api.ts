import { useMutation } from '@tanstack/react-query';

import { closeAllConnections, closeConnection } from '@entities/Connection';

export function useCloseConnection() {
  return useMutation({
    mutationFn: closeConnection,
    meta: { showError: true, errorMessageKey: 'toast.connection.close.failed' },
  });
}

export function useCloseAllConnections() {
  return useMutation({
    mutationFn: closeAllConnections,
    meta: { showError: true, errorMessageKey: 'toast.connection.close.failed' },
  });
}
