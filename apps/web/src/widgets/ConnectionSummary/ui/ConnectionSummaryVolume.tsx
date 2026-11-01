import { useTranslation } from 'react-i18next';

import type { ConnectionTotals } from '@entities/Connection';
import { formatBytes } from '@shared/lib/format';

import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';
import { ConnectionSummarySplit, type SplitSlice } from './ConnectionSummarySplit';

/**
 * How much has passed through sing-box since its start. Counters are cumulative and
 * reset by a service restart, not by opening the panel.
 */
export function ConnectionSummaryVolume({ totals }: { totals: ConnectionTotals }) {
  const { t } = useTranslation('widgets/ConnectionSummary');
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
      <ConnectionSummarySplit slices={slices} empty={t('volume.empty')} />
    </ConnectionSummaryPanel>
  );
}
