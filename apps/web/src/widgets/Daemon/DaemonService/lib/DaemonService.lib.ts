import { useState } from 'react';

import { toConfirmedStatus, type ServiceState } from '@entities/Daemon';

/**
 * Последнее состояние службы, которое демон прочитал, а не подставил. `null` —
 * подтверждённого состояния с монтирования ещё не было. Поток шлёт состояние
 * раз в несколько секунд, и одно неудачное чтение procd не должно перекрашивать
 * карточку: до следующего удачного кадра она показывает то, что было известно.
 */
export function useLastConfirmedService(state: ServiceState | undefined): ServiceState | null {
  const [last, setLast] = useState<ServiceState | null>(null);
  const confirmed = state !== undefined && toConfirmedStatus(state) !== null ? state : null;

  if (confirmed !== null && confirmed !== last) {
    setLast(confirmed);
  }

  return confirmed ?? last;
}
