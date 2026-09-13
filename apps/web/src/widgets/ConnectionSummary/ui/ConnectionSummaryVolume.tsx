import type { ConnectionTotals } from '@entities/Connection';
import { formatBytes } from '@shared/lib/format';

import { ConnectionSummaryDonut, type DonutSlice } from './ConnectionSummaryDonut';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/**
 * Сколько прошло через sing-box с его запуска. Счётчики накопительные и
 * обнуляются перезапуском сервиса, а не открытием панели.
 */
export function ConnectionSummaryVolume({ totals }: { totals: ConnectionTotals }) {
  const slices: DonutSlice[] = [
    {
      key: 'download',
      label: 'Получено',
      value: totals.download,
      caption: formatBytes(totals.download),
      tone: 'text-series-down',
    },
    {
      key: 'upload',
      label: 'Отдано',
      value: totals.upload,
      caption: formatBytes(totals.upload),
      tone: 'text-series-up',
    },
  ];

  return (
    <ConnectionSummaryPanel title='Всего передано'>
      <ConnectionSummaryDonut slices={slices} empty='Счётчики ещё не пришли' />
    </ConnectionSummaryPanel>
  );
}
