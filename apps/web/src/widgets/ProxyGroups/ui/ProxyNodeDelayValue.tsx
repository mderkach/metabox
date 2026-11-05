import { useTranslation } from 'react-i18next';

import { DELAY_TIMEOUT, type ProxyNode } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { toDelayText } from '../lib/ProxyGroups.delay';
import { DELAY_TONE } from './ProxyDelayTone';

export function ProxyNodeDelayValue({ node }: { node: ProxyNode }) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const text = toDelayText(t, node);

  if (node.delay === null) {
    return <span className='text-xs text-muted-foreground'>{text}</span>;
  }

  // A separate label, not "65535 ms": this is a connection failure, not a latency.
  if (node.delay >= DELAY_TIMEOUT) {
    return <span className='text-xs font-medium text-signal-bad'>{text}</span>;
  }

  return (
    <span className={cn('font-mono text-xs font-medium tabular-nums', DELAY_TONE[node.delayState])}>
      <data value={node.delay}>{text}</data>
    </span>
  );
}
