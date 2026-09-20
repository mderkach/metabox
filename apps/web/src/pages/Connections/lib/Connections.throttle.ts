import { useEffect, useRef, useState } from 'react';

import type { ConnectionRow } from '@entities/Connection';
import { REFRESH_INTERVAL } from '@widgets/ConnectionTable';

/**
 * Показанный набор строк, обновляемый не чаще заданного интервала.
 *
 * Дросселирование живёт на экране, а не в сторе: кольцо истории в нём подписано
 * «за минуту» при шаге снапшота в секунду, и растянутый шаг превратил бы минуту
 * в четверть часа. Сводка обзора считается там же и по той же причине остаётся
 * живой.
 *
 * При `Live` набор отдаётся без задержки: лишний кадр состояния на каждую
 * секунду стоил бы дороже самой задержки.
 */
export function useThrottledRows(rows: ConnectionRow[], interval: number): ConnectionRow[] {
  const latest = useRef(rows);
  const [shown, setShown] = useState(rows);

  useEffect(function keepLatestRows() {
    latest.current = rows;
  });

  useEffect(
    function startRefresh() {
      // Первый набор показывается сразу: иначе смена интервала гасила бы список
      // до конца первого периода.
      setShown(latest.current);

      if (interval === REFRESH_INTERVAL.Live) {
        return;
      }

      const timer = setInterval(function refreshRows() {
        setShown(latest.current);
      }, interval);

      return function stopRefresh() {
        clearInterval(timer);
      };
    },
    [interval]
  );

  return interval === REFRESH_INTERVAL.Live ? rows : shown;
}
