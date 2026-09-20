import { useEffect } from 'react';

import { useOutboundTypes } from '@entities/Config/@x/connection';

import { ConnectionStore } from '../model/Connection.store';

/**
 * Экран объявляет, что смотрит поток. Сокет открывает оболочка: держать его
 * открытым на всех экранах незачем, а открывать из компонента — значит
 * заводить второй поток на каждое переоткрытие экрана.
 *
 * Отсюда же в стор попадают типы аутбаундов: разбор снапшота живёт вне дерева
 * компонентов, а конфиг читается запросом, и связать их может только экран.
 */
export function useConnectionStream(): void {
  const outboundTypes = useOutboundTypes();

  useEffect(function countConnectionReader() {
    const { addReader, removeReader } = ConnectionStore.getState();

    addReader();

    return removeReader;
  }, []);

  useEffect(
    function loadOutboundTypes() {
      ConnectionStore.getState().setOutboundTypes(outboundTypes);
    },
    [outboundTypes]
  );
}
