import { useTranslation } from 'react-i18next';

import { formatBytes } from '@shared/lib/format';

import { DaemonSparkline } from './DaemonSparkline';

/** По одной точке линию не проведёшь. */
const MIN_POINTS = 2;

/**
 * Память за десять минут. Отдельный спарклайн, а не второй ряд на графике
 * трафика: у них разные единицы, и общая шкала врала бы про обе (одна ось —
 * одна величина).
 */
export function DaemonMemory({ samples }: { samples: number[] }) {
  const { t } = useTranslation('widgets/Daemon/DaemonTraffic');

  if (samples.length < MIN_POINTS) {
    return null;
  }

  return (
    <DaemonSparkline
      samples={samples}
      label={t('memory.label', { from: formatBytes(Math.min(...samples)), to: formatBytes(Math.max(...samples)) })}
    />
  );
}
