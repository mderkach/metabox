import { useEffect } from 'react';

import { ConnectionStore } from '../model/Connection.store';

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
