import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ConnectionStore } from '../model/Connection.store';
import { closeAllConnections, closeConnection } from './Connection.api';

/**
 * Экран объявляет, что смотрит поток. Сокет открывает оболочка: держать его
 * открытым на всех экранах незачем, а открывать из компонента — значит
 * заводить второй поток на каждое переоткрытие экрана.
 */
export function useConnectionStream(): void {
  useEffect(function countConnectionReader() {
    const { addReader, removeReader } = ConnectionStore.getState();

    addReader();

    return removeReader;
  }, []);
}

export function useCloseConnection() {
  return useMutation({
    mutationFn: closeConnection,
    meta: { showError: true, errorMessageKey: 'connection.close.failed' },
  });
}

export function useCloseAllConnections() {
  return useMutation({
    mutationFn: closeAllConnections,
    meta: { showError: true, errorMessageKey: 'connection.close.failed' },
  });
}
