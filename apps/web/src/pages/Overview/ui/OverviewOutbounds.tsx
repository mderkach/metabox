import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { usePanelAsSheet } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import {
  CARD_FLUSH,
  Card,
  Empty,
  EMPTY_INLINE,
  EmptyDescription,
  EmptyHeader,
  QueryFailure,
  TABLE_HEADER,
} from '@shared/ui';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { CoreGap } from '../lib';
import type { OverviewOutbound } from '../model/Overview.outbounds';
import { OUTBOUND_LEADING_COLUMNS, OUTBOUND_ROW_GRID } from './Overview.outboundStyles';
import { OverviewCoreGap } from './OverviewCoreGap';
import { OverviewOutboundRow } from './OverviewOutboundRow';
import { OverviewSection } from './OverviewSection';

export function OverviewOutbounds({
  rows,
  periodSeconds,
  reachable,
  gap,
  waiting,
  failure,
  latencyAvailable,
  testingServer,
  onTest,
}: {
  rows: readonly OverviewOutbound[];
  periodSeconds: number | undefined;
  reachable: boolean;
  gap: CoreGap | null;
  waiting: boolean;
  failure: ComponentProps<typeof QueryFailure>['query'] | undefined;
  latencyAvailable: boolean;
  testingServer: string | null;
  onTest: (server: string) => Promise<void>;
}) {
  const { t } = useTranslation(OVERVIEW_NS);
  const stacked = usePanelAsSheet();
  const leadingColumns = stacked ? OUTBOUND_LEADING_COLUMNS.Stacked : OUTBOUND_LEADING_COLUMNS.Wide;

  const showRows = reachable && gap === null && failure === undefined && !waiting;

  return (
    <OverviewSection title={t('outbounds.title')}>
      {!reachable && (
        <Empty className={EMPTY_INLINE}>
          <EmptyHeader>
            <EmptyDescription>{t('outbounds.offline')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {reachable && gap !== null && <OverviewCoreGap gap={gap} />}
      {reachable && gap === null && failure !== undefined && (
        <QueryFailure messageKey='source.config' query={failure} />
      )}
      {reachable && gap === null && failure === undefined && waiting && <OverviewCoreGap gap={null} />}
      {showRows && rows.length === 0 && (
        <Empty className={EMPTY_INLINE}>
          <EmptyHeader>
            <EmptyDescription>{t('outbounds.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {showRows && rows.length > 0 && (
        <Card className={CARD_FLUSH}>
          <div role='table' aria-label={t('outbounds.title')}>
            <div role='row' className={cn(OUTBOUND_ROW_GRID, TABLE_HEADER, stacked ? 'sr-only' : 'py-2.5 leading-5')}>
              {leadingColumns.map((column) => (
                <div key={column} role='columnheader'>
                  {t(`outbounds.${column}`)}
                </div>
              ))}
              <div role='columnheader'>{t('outbounds.latency')}</div>
              <div role='columnheader'>{t('outbounds.rate')}</div>
              <div role='columnheader' className='text-right'>
                {t('outbounds.connections')}
              </div>
            </div>
            {rows.map((row) => (
              <OverviewOutboundRow
                key={row.final ? 'final' : `rule:${row.name.tag}`}
                row={row}
                periodSeconds={periodSeconds}
                latencyAvailable={latencyAvailable}
                leadingColumns={leadingColumns}
                testingServer={testingServer}
                onTest={onTest}
              />
            ))}
          </div>
        </Card>
      )}
    </OverviewSection>
  );
}
