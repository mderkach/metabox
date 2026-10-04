import { useEffect } from 'react';

import { MS_IN_SECOND } from '../lib/time';
import type { PlotInstance } from './Plot';

/**
 * Сдвиг оси времени по кадрам: данные приходят раз в секунду, а окно едет
 * непрерывно. Линия не догоняет новую точку — точка появляется сразу,
 * двигается только ось. Окно всегда полной длины: подписи оси стоят на
 * месте, а неполный буфер оставляет левую часть пустой. Выключенный сдвиг оставляет ось тому, кто ставит её
 * вместе с данными.
 *
 * Правая кромка отстаёт от «сейчас» на `lag` — шаг потока. Иначе между
 * кадрами хвост области отставал бы от кромки почти на секунду и прыгал к ней
 * с каждой новой точкой; с отставанием новая точка приходит за кромкой и
 * въезжает в окно плавно.
 */
export function useFollowNow(chart: PlotInstance | null, span: number, lag: number, enabled: boolean) {
  useEffect(
    function followNow() {
      if (chart === null || !enabled) {
        return;
      }

      let frame = requestAnimationFrame(function shiftWindow() {
        const now = Date.now() / MS_IN_SECOND - lag;

        chart.setScale('x', { min: now - span, max: now });
        frame = requestAnimationFrame(shiftWindow);
      });

      return function stopFollowing() {
        cancelAnimationFrame(frame);
      };
    },
    [chart, span, lag, enabled]
  );
}
