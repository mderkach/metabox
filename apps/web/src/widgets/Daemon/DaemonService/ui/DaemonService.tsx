import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useServiceState, type SystemProcess } from '@entities/Daemon';
import { formatBytes } from '@shared/lib/format';
import { CARD_TITLE, Card, CardContent, CardHeader } from '@shared/ui';

import { DaemonServiceRow } from './DaemonServiceRow';

/**
 * sing-box process readings: binary, memory and its history. The state and
 * the commands are `DaemonServiceControl`: they belong to the screen status,
 * the readings to its details.
 */
export function DaemonService({
  process,
  heap,
  memoryTrend,
}: {
  /** Process readings from the `system` topic; empty when the process is not found. */
  process?: SystemProcess;
  /** Go runtime memory from Clash API: it is smaller than RSS by the resident code. */
  heap: number;
  /**
   * Process memory history under the rows — a leak is visible in it. As a ready node:
   * slices of one layer do not import each other.
   */
  memoryTrend?: ReactNode;
}) {
  const { t } = useTranslation('widgets/Daemon/DaemonService');
  const service = useServiceState();

  if (!service.isSuccess) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <h3 className={CARD_TITLE}>sing-box</h3>
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
        <dl className='text-sm'>
          <DaemonServiceRow label={t('row.binary')} value={service.data.binary} mono />
          {process !== undefined && (
            <DaemonServiceRow
              label={t('row.processMemory')}
              value={`${formatBytes(process.rss)} · pid ${String(process.pid)}`}
            />
          )}
          {heap > 0 && <DaemonServiceRow label={t('row.goMemory')} value={formatBytes(heap)} />}
        </dl>

        {memoryTrend}
      </CardContent>
    </Card>
  );
}
