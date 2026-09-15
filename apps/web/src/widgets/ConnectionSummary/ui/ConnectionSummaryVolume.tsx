import { useTranslation } from 'react-i18next';

import type { ConnectionTotals } from '@entities/Connection';
import { formatBytes } from '@shared/lib/format';

import { ConnectionSummaryDonut, type DonutSlice } from './ConnectionSummaryDonut';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/**
 * Сколько прошло через sing-box с его запуска. Счётчики накопительные и
 * обнуляются перезапуском сервиса, а не открытием панели.
 */
export function ConnectionSummaryVolume({ totals }: { totals: ConnectionTotals }) {
  const { t } = useTranslation('widgets/ConnectionSummary');
  const slices: DonutSlice[] = [
    {
      key: 'download',
      label: t('volume.down'),
      value: totals.download,
      caption: formatBytes(totals.download),
      tone: 'text-series-down',
    },
    {
      key: 'upload',
      label: t('volume.up'),
      value: totals.upload,
      caption: formatBytes(totals.upload),
      tone: 'text-series-up',
    },
  ];

  return (
    <ConnectionSummaryPanel title={t('volume.title')}>
      <ConnectionSummaryDonut slices={slices} empty={t('volume.empty')} />
    </ConnectionSummaryPanel>
  );
}
