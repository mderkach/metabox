import { useEffect, useState } from 'react';

import { MS_IN_MINUTE } from '@shared/lib/time';

/**
 * Текущее время с шагом в минуту: подпись «обновлена N назад» не показывает
 * секунд, поэтому чаще перерисовывать список подписок незачем.
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(function startClock() {
    const timer = setInterval(function tick() {
      setNow(Date.now());
    }, MS_IN_MINUTE);

    return function stopClock() {
      clearInterval(timer);
    };
  }, []);

  return now;
}
