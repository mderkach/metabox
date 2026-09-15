import { useTranslation } from 'react-i18next';

import type { ConnectionShare } from '@entities/Connection';
import { formatRate } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from './ConnectionSummaryBars';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/** Скорость считает панель: рантайм отдаёт только накопленные счётчики. */
export function ConnectionSummaryTop({
  title,
  href,
  shares,
  empty,
}: {
  title: string;
  href?: string;
  shares: ConnectionShare[];
  empty: string;
}) {
  const { t } = useTranslation('widgets/ConnectionSummary');
  const peak = shares.reduce((max, share) => Math.max(max, share.rate), 0);
  const bars: SummaryBar[] = shares.map((share) => ({
    key: share.key,
    label: share.key,
    value: share.rate,
    caption: `${share.rate > 0 ? formatRate(share.rate) : t('idle')} · ${t('count.connection', {
      ns: 'shared',
      count: share.count,
    })}`,
    tone: 'bg-primary',
  }));

  return (
    <ConnectionSummaryPanel title={title} href={href}>
      <ConnectionSummaryBars bars={bars} total={peak} empty={empty} />
    </ConnectionSummaryPanel>
  );
}
