import { useTranslation } from 'react-i18next';

import type { ConnectionShare } from '@entities/Connection';

import { ConnectionSummaryDonut, type DonutSlice } from './ConnectionSummaryDonut';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/** The tone is tied to the name: order comes by load and is not stable. */
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
  const { t } = useTranslation('widgets/ConnectionSummary');
  const slices: DonutSlice[] = shares.toSorted(byProtocol).map((share) => ({
    key: share.key,
    label: share.key.toUpperCase(),
    value: share.count,
    caption: t('count.connection', { ns: 'shared', count: share.count }),
    tone: PROTOCOL_TONES[share.key] ?? OTHER_TONE,
  }));

  return (
    <ConnectionSummaryPanel title={t('network.title')}>
      <ConnectionSummaryDonut slices={slices} empty={t('empty')} />
    </ConnectionSummaryPanel>
  );
}
