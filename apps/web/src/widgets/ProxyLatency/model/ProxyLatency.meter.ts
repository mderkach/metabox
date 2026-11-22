import { DELAY_TIMEOUT, LATENCY_CEILING_MS, type ProxyNode } from '@entities/Proxy';
import { toShare } from '@shared/lib/chart';

export function toMeter(node: Pick<ProxyNode, 'delay' | 'delayState'>): number | null {
  if (node.delay === null) {
    return null;
  }

  return node.delay >= DELAY_TIMEOUT ? 1 : toShare(Math.min(node.delay, LATENCY_CEILING_MS), LATENCY_CEILING_MS);
}
