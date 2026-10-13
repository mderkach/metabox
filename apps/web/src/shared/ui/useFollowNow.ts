import { useEffect } from 'react';

import { MS_IN_SECOND } from '../lib/time';
import type { PlotInstance } from './Plot';

/**
 * Time axis shift per frame: data arrives once a second, while the window moves
 * continuously. The line does not catch up with a new point — the point appears at once,
 * only the axis moves. The window is always full length: axis labels stay in
 * place, and an incomplete buffer leaves the left part empty. A disabled shift leaves the axis to whoever sets it
 * together with the data.
 *
 * The right edge lags "now" by `lag` — the stream step. Otherwise between
 * frames the area tail would lag the edge by almost a second and jump to it
 * with each new point; with the lag a new point arrives beyond the edge and
 * slides into the window smoothly.
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
