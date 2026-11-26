import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionTotals } from '@entities/Connection';
import { formatBytes } from '@shared/lib/format';

import { CONNECTION_SUMMARY_NS } from '../i18n/ConnectionSummary.namespace.generated';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';
import { ConnectionSummarySplit, type SplitSlice } from './ConnectionSummarySplit';

/**
 * How much has passed through sing-box since its start. Counters are cumulative and
 * reset by a service restart, not by opening the panel.
 */
export function ConnectionSummaryVolume({
  totals,
  placeholder,
}: {
  totals: ConnectionTotals;
  /** Replaces the card body when the page knows the data is missing or still loading. */
  placeholder?: ReactNode;
}) {
  const { t } = useTranslation(CONNECTION_SUMMARY_NS);
  const slices: SplitSlice[] = [
    {
      key: 'download',
      label: t('volume.down'),
      value: totals.download,
      caption: formatBytes(totals.download),
      tone: 'bg-series-down',
    },
    {
      key: 'upload',
      label: t('volume.up'),
      value: totals.upload,
      caption: formatBytes(totals.upload),
      tone: 'bg-series-up',
    },
  ];

  return (
    <ConnectionSummaryPanel title={t('volume.title')}>
      {placeholder ?? <ConnectionSummarySplit slices={slices} empty={t('volume.empty')} />}
    </ConnectionSummaryPanel>
  );
}
