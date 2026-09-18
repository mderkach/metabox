import { useEffect, useState } from 'react';

import { MS_IN_SECOND } from '@shared/lib/time';

/**
 * Часы для колонки времени. Отдельный отсчёт, а не `Date.now()` в теле строки:
 * строка мемоизирована и при неизменившихся байтах не перерисовывалась бы, то
 * есть показывала бы время на момент последней смены счётчика.
 *
 * Цена — рендер видимых строк раз в секунду: `memo` на них экономит сравнение
 * поддерева, но не сам вызов. Список виртуализован, поэтому речь про десятки
 * строк, а не про все пять тысяч (NFR-2).
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(function startClock() {
    const timer = setInterval(function tick() {
      setNow(Date.now());
    }, MS_IN_SECOND);

    return function stopClock() {
      clearInterval(timer);
    };
  }, []);

  return now;
}
