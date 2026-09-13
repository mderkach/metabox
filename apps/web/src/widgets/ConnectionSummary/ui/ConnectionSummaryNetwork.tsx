import { CONNECTION_FORMS, type ConnectionShare } from '@entities/Connection';
import { plural } from '@shared/lib/format';

import { ConnectionSummaryDonut, type DonutSlice } from './ConnectionSummaryDonut';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/** Тон закреплён за именем: порядок приходит по нагрузке и не устойчив. */
const PROTOCOL_TONES: Readonly<Record<string, string>> = {
  tcp: 'text-primary',
  udp: 'text-signal-warn',
};

const OTHER_TONE = 'text-muted-foreground';

const PROTOCOL_ORDER = ['tcp', 'udp'];

function byProtocol(left: ConnectionShare, right: ConnectionShare): number {
  const leftIndex = PROTOCOL_ORDER.indexOf(left.key);
  const rightIndex = PROTOCOL_ORDER.indexOf(right.key);

  return (leftIndex < 0 ? PROTOCOL_ORDER.length : leftIndex) - (rightIndex < 0 ? PROTOCOL_ORDER.length : rightIndex);
}

export function ConnectionSummaryNetwork({ shares }: { shares: ConnectionShare[] }) {
  const slices: DonutSlice[] = shares.toSorted(byProtocol).map((share) => ({
    key: share.key,
    label: share.key.toUpperCase(),
    value: share.count,
    caption: plural(share.count, CONNECTION_FORMS),
    tone: PROTOCOL_TONES[share.key] ?? OTHER_TONE,
  }));

  return (
    <ConnectionSummaryPanel title='Типы сети'>
      <ConnectionSummaryDonut slices={slices} empty='Живых соединений нет' />
    </ConnectionSummaryPanel>
  );
}
