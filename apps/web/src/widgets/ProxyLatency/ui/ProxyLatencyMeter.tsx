import { DELAY_STATE, type ProxyNode } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { toMeter } from '../model/ProxyLatency.meter';

const DELAY_TONE: Readonly<Record<string, string>> = {
  [DELAY_STATE.Fast]: 'bg-signal-ok',
  [DELAY_STATE.Slow]: 'bg-signal-warn',
  [DELAY_STATE.Failed]: 'bg-signal-bad',
  [DELAY_STATE.Unknown]: 'bg-signal-idle',
};

const PERCENT = 100;

export function ProxyLatencyMeter({ node }: { node: ProxyNode }) {
  const share = toMeter(node);

  if (share === null) {
    return <span className='col-span-2 block h-1.5 rounded-full border border-dashed border-border' />;
  }

  return (
    <span className='col-span-2 block h-1.5 overflow-hidden rounded-full bg-meter-track'>
      <span
        className={cn('block h-full rounded-full', DELAY_TONE[node.delayState])}
        style={{ width: `${String(share * PERCENT)}%` }}
      />
    </span>
  );
}
