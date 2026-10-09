import { useTranslation } from 'react-i18next';

import type { ConnectionShare } from '@entities/Connection';
import { formatBytes, formatRate } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from './ConnectionSummaryBars';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/**
 * Топ по накопленному объёму, а не по мгновенной скорости: скорость гуляет
 * каждую секунду, и строки менялись бы местами под взглядом. Длина полосы и
 * порядок — объём, живая скорость — в подписи. Скорость считает панель:
 * рантайм отдаёт только накопленные счётчики.
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
  /** Подпись пустого ряда; без неё — общая «живых соединений нет». */
  empty?: string;
  /** Подпись группы по ключу — имя устройства вместо адреса; без неё — сам ключ. */
  label?: (key: string) => string;
}) {
  const { t } = useTranslation('widgets/ConnectionSummary');
  const bars: SummaryBar[] = shares.map((share) => ({
    key: share.key,
    label: label === undefined ? share.key : label(share.key),
    value: share.volume,
    caption: `${share.rate > 0 ? formatRate(share.rate) : t('idle')} · ${t('count.connection', {
      ns: 'shared',
      count: share.count,
    })}`,
    tone: 'bg-primary',
  }));

  return (
    <ConnectionSummaryPanel title={title} href={href}>
      <ConnectionSummaryBars bars={bars} empty={empty ?? t('empty')} format={formatBytes} />
    </ConnectionSummaryPanel>
  );
}
