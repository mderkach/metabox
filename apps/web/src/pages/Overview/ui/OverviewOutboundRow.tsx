import { useTranslation } from 'react-i18next';

import { ROUTE_ORIGIN, RouteOriginBadge } from '@entities/Route';
import { formatAge, formatBytes } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { OUTBOUND_KIND, type OverviewOutbound } from '../model/Overview.outbounds';
import { OUTBOUND_ROW_GRID, type OUTBOUND_LEADING_COLUMNS } from './Overview.outboundStyles';
import { OverviewOutboundIdentity } from './OverviewOutboundIdentity';
import { OverviewOutboundLatency } from './OverviewOutboundLatency';
import { OverviewOutboundRate } from './OverviewOutboundRate';
import { OverviewOutboundRules } from './OverviewOutboundRules';

export function OverviewOutboundRow({
  row,
  periodSeconds,
  latencyAvailable,
  leadingColumns,
  testingServer,
  onTest,
}: {
  row: OverviewOutbound;
  periodSeconds: number | undefined;
  latencyAvailable: boolean;
  leadingColumns: (typeof OUTBOUND_LEADING_COLUMNS)[keyof typeof OUTBOUND_LEADING_COLUMNS];
  testingServer: string | null;
  onTest: (server: string) => Promise<void>;
}) {
  const { t } = useTranslation(OVERVIEW_NS);
  const { traffic, connections } = row;
  const idle = !row.final && traffic?.bytes === 0 && row.rate?.kind === 'idle';
  const latencyApplies = row.kind === OUTBOUND_KIND.Group || row.kind === OUTBOUND_KIND.Server;
  const isTesting = testingServer !== null && testingServer === row.latency?.server.tag;

  return (
    <div
      role='row'
      className={cn(
        OUTBOUND_ROW_GRID,
        'grid-cols-3 items-start border-t border-border wrap-anywhere lg:items-center',
        row.final && 'bg-table-head last:rounded-b-2xl'
      )}
    >
      {leadingColumns.map((column) =>
        column === 'rules' ? (
          <OverviewOutboundRules key={column} row={row} quiet={idle} />
        ) : (
          <OverviewOutboundIdentity key={column} row={row} quiet={idle} />
        )
      )}
      <OverviewOutboundLatency
        latency={row.latency}
        applicable={latencyApplies}
        available={latencyAvailable}
        testing={isTesting}
        busy={testingServer !== null}
        onTest={onTest}
      />
      <OverviewOutboundRate rate={row.rate} />
      <div role='cell' className='min-w-0 space-y-1 text-xs lg:text-right'>
        <p className='text-muted-foreground lg:sr-only'>{t('outbounds.connections')}</p>
        <p className='text-sm font-medium'>
          {connections === null ? (
            <span className='text-xs text-muted-foreground'>{t('outbounds.unavailable')}</span>
          ) : (
            <data className='font-mono tabular-nums' value={connections}>
              {connections}
            </data>
          )}
        </p>
        {traffic !== null && periodSeconds !== undefined && (
          <>
            <p className='font-mono text-muted-foreground tabular-nums'>
              <span className='sr-only'>{t('outbounds.volume')}</span>
              <data value={traffic.bytes}>{formatBytes(traffic.bytes)}</data>
            </p>
            <p className='text-muted-foreground'>{t('outbounds.period', { age: formatAge(periodSeconds) })}</p>
            {traffic.origin === ROUTE_ORIGIN.Computed && <RouteOriginBadge origin={ROUTE_ORIGIN.Computed} />}
          </>
        )}
      </div>
    </div>
  );
}
