import { useTranslation } from 'react-i18next';

import type { ConnectionShare } from '@entities/Connection';
import { formatBytes, formatRate } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from './ConnectionSummaryBars';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/**
 * Top by accumulated volume of live connections, not by instantaneous speed:
 * speed wanders every second, and rows would swap places before the eye.
 * Bar length, order and the first number of the caption are the volume, live speed is after
 * it. Speed is computed by the panel: the runtime returns only accumulated counters.
 */
export function ConnectionSummaryTop({
  title,
  href,
  shares,
  empty,
  label,
}: {
  title: string;
  href?: string;
  shares: ConnectionShare[];
  /** Caption of an empty row; without it, the general "no live connections". */
  empty?: string;
  /** Group caption by key — a device name instead of an address; without it, the key itself. */
  label?: (key: string) => string;
}) {
  const { t } = useTranslation('widgets/ConnectionSummary');
  const bars: SummaryBar[] = shares.map((share) => ({
    key: share.key,
    label: label === undefined ? share.key : label(share.key),
    value: share.volume,
    caption: share.rate > 0 ? formatRate(share.rate) : t('idle'),
    tone: 'bg-primary',
  }));

  return (
    <ConnectionSummaryPanel title={title} href={href}>
      <ConnectionSummaryBars bars={bars} empty={empty ?? t('empty')} format={formatBytes} />
    </ConnectionSummaryPanel>
  );
}
