import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionShare } from '@entities/Connection';
import { SHARED_NS } from '@shared/i18n';

import { CONNECTION_SUMMARY_NS } from '../i18n/ConnectionSummary.namespace.generated';
import { byProtocol } from '../model/ConnectionSummary.network';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';
import { ConnectionSummarySplit, type SplitSlice } from './ConnectionSummarySplit';

/** The tone is tied to the name: order comes by load and is not stable. */
const PROTOCOL_TONES: Readonly<Record<string, string>> = {
  tcp: 'bg-primary',
  udp: 'bg-signal-warn',
};

const OTHER_TONE = 'bg-muted-foreground';

export function ConnectionSummaryNetwork({
  shares,
  placeholder,
}: {
  shares: ConnectionShare[];
  /** Replaces the card body when the page knows the data is missing or still loading. */
  placeholder?: ReactNode;
}) {
  const { t } = useTranslation(CONNECTION_SUMMARY_NS);
  const slices: SplitSlice[] = shares.toSorted(byProtocol).map((share) => ({
    key: share.key,
    label: share.key.toUpperCase(),
    value: share.count,
    caption: t('count.connection', { ns: SHARED_NS, count: share.count }),
    tone: PROTOCOL_TONES[share.key] ?? OTHER_TONE,
  }));

  return (
    <ConnectionSummaryPanel title={t('network.title')}>
      {placeholder ?? <ConnectionSummarySplit slices={slices} empty={t('empty')} />}
    </ConnectionSummaryPanel>
  );
}
