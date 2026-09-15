import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ROUTE_KIND, type ConnectionShare, type RouteKind } from '@entities/Connection';
import { formatRate } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from './ConnectionSummaryBars';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/** Тон исхода — ADR-0013. Порядок строк фиксирован: по нагрузке он не устойчив. */
const KIND_VIEW = [
  { kind: ROUTE_KIND.Proxy, label: 'outcome.proxy', tone: 'bg-route-proxy' },
  { kind: ROUTE_KIND.Direct, label: 'outcome.direct', tone: 'bg-route-direct' },
  { kind: ROUTE_KIND.Block, label: 'outcome.block', tone: 'bg-route-block' },
  { kind: ROUTE_KIND.Dns, label: 'outcome.dns', tone: 'bg-route-dns' },
  { kind: ROUTE_KIND.Other, label: 'outcome.other', tone: 'bg-route-neutral' },
] as const satisfies readonly { kind: RouteKind; label: ParseKeys<'widgets/ConnectionSummary'>; tone: string }[];

/** Столбец длиной в соединения: молчащее соединение — тоже маршрут. */
export function ConnectionSummaryOutcome({ shares }: { shares: ConnectionShare<RouteKind>[] }) {
  const { t } = useTranslation('widgets/ConnectionSummary');
  const total = shares.reduce((sum, share) => sum + share.count, 0);
  const bars: SummaryBar[] = KIND_VIEW.flatMap((view) => {
    const share = shares.find((entry) => entry.key === view.kind);

    if (share === undefined) {
      return [];
    }

    return [
      {
        key: view.kind,
        label: t(view.label),
        value: share.count,
        caption: `${t('count.connection', { ns: 'shared', count: share.count })} · ${formatRate(share.rate)}`,
        tone: view.tone,
      },
    ];
  });

  return (
    <ConnectionSummaryPanel title={t('outcome.title')}>
      <ConnectionSummaryBars bars={bars} total={total} empty={t('empty')} />
    </ConnectionSummaryPanel>
  );
}
