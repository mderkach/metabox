import { useEffect } from 'react';

import { toTimeWindow } from '@shared/lib/chart';
import { MS_IN_SECOND } from '@shared/lib/time';
import type { PlotInstance } from '@shared/ui';

/**
 * Сдвиг оси времени по кадрам: данные приходят раз в секунду, а окно едет
 * непрерывно. Линия не догоняет новую точку — точка появляется сразу,
 * двигается только ось. Выключенный сдвиг оставляет ось тому, кто ставит её
 * вместе с данными.
 */
export function useFollowNow(chart: PlotInstance | null, span: number, enabled: boolean) {
  useEffect(
    function followNow() {
      if (chart === null || !enabled) {
        return;
      }

      let frame = requestAnimationFrame(function shiftWindow() {
        const first = chart.data[0].at(0);

        if (first !== undefined) {
          chart.setScale('x', toTimeWindow(first, Date.now() / MS_IN_SECOND, span));
        }

        frame = requestAnimationFrame(shiftWindow);
      });

      return function stopFollowing() {
        cancelAnimationFrame(frame);
      };
    },
    [chart, span, enabled]
  );
}
