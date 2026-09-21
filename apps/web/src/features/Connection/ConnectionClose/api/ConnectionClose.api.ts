import { useMutation } from '@tanstack/react-query';

import { closeAllConnections, closeConnection } from '@entities/Connection';

export function useCloseConnection() {
  return useMutation({
    mutationFn: closeConnection,
    meta: { showError: true, errorMessageKey: 'toast.connection.close.failed' },
  });
}

/**
 * Обрыв всех живых соединений. Успех подтверждается тостом, в отличие от
 * обрыва одного: там результат виден строкой, которая ушла из списка.
 */
export function useCloseAllConnections() {
  return useMutation({
    mutationFn: closeAllConnections,
    meta: {
      showError: true,
      errorMessageKey: 'toast.connection.close.failed',
      showSuccess: true,
      successMessageKey: 'toast.connection.closeAll.done',
    },
  });
}
