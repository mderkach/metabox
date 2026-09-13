import { CONNECTION_FORMS, ROUTE_KIND, type ConnectionShare, type RouteKind } from '@entities/Connection';
import { formatRate, plural } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from './ConnectionSummaryBars';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/** Тон исхода — ADR-0013. Порядок строк фиксирован: по нагрузке он не устойчив. */
const KIND_VIEW: readonly { kind: RouteKind; label: string; tone: string }[] = [
  { kind: ROUTE_KIND.Proxy, label: 'через прокси', tone: 'bg-route-proxy' },
  { kind: ROUTE_KIND.Direct, label: 'напрямую', tone: 'bg-route-direct' },
  { kind: ROUTE_KIND.Block, label: 'в блок', tone: 'bg-route-block' },
  { kind: ROUTE_KIND.Dns, label: 'перехват DNS', tone: 'bg-route-dns' },
  { kind: ROUTE_KIND.Other, label: 'прочее', tone: 'bg-route-neutral' },
];

/** Столбец длиной в соединения: молчащее соединение — тоже маршрут. */
export function ConnectionSummaryOutcome({ shares }: { shares: ConnectionShare<RouteKind>[] }) {
  const total = shares.reduce((sum, share) => sum + share.count, 0);
  const bars: SummaryBar[] = KIND_VIEW.flatMap((view) => {
    const share = shares.find((entry) => entry.key === view.kind);

    if (share === undefined) {
      return [];
    }

    return [
      {
        key: view.kind,
        label: view.label,
        value: share.count,
        caption: `${plural(share.count, CONNECTION_FORMS)} · ${formatRate(share.rate)}`,
        tone: view.tone,
      },
    ];
  });

  return (
    <ConnectionSummaryPanel title='Куда уходит трафик'>
      <ConnectionSummaryBars bars={bars} total={total} empty='Живых соединений нет' />
    </ConnectionSummaryPanel>
  );
}
