import { useMutation } from '@tanstack/react-query';

import { closeAllConnections, closeConnection } from '@entities/Connection';

export function useCloseConnection() {
  return useMutation({
    mutationFn: closeConnection,
    meta: { showError: true, errorMessageKey: 'toast.connection.close.failed' },
  });
}

/**
 * Обрыв всех живых соединений. Тоста об успехе нет, как и у обрыва одного:
 * результат видно по строкам, ушедшим из списка, а скринридеру его объявляет
 * живая область экрана. Тост `sonner` объявил бы его второй раз.
 */
export function useCloseAllConnections() {
  return useMutation({
    mutationFn: closeAllConnections,
    meta: { showError: true, errorMessageKey: 'toast.connection.close.failed' },
  });
}
