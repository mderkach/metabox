import { DELAY_TIMEOUT, type ProxyNode } from '@entities/Proxy';
import { toShare } from '@shared/lib/chart';

import { SCALE_CEILING } from './ProxyLatency.scale';

export function toMeter(node: ProxyNode): number | null {
  if (node.delay === null) {
    return null;
  }

  return node.delay >= DELAY_TIMEOUT ? 1 : toShare(Math.min(node.delay, SCALE_CEILING), SCALE_CEILING);
}
