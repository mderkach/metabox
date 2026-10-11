import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ROUTE_KIND, type ConnectionShare, type RouteKind } from '@entities/Connection';
import { formatBytes } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from './ConnectionSummaryBars';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/** Порядок строк фиксирован: по нагрузке он не устойчив. */
const KIND_VIEW = [
  { kind: ROUTE_KIND.Proxy, label: 'route.proxy', tone: 'bg-route-proxy' },
  { kind: ROUTE_KIND.Direct, label: 'route.direct', tone: 'bg-route-direct' },
  { kind: ROUTE_KIND.Block, label: 'route.block', tone: 'bg-route-block' },
  { kind: ROUTE_KIND.Dns, label: 'route.dns', tone: 'bg-route-dns' },
  { kind: ROUTE_KIND.Other, label: 'route.other', tone: 'bg-route-neutral' },
] as const satisfies readonly { kind: RouteKind; label: ParseKeys<'shared'>; tone: string }[];

/** Столбец длиной в объём трафика, а не в число соединений: молчащее соединение остаётся в списке, но веса не добавляет. */
export function ConnectionSummaryAction({ shares }: { shares: ConnectionShare<RouteKind>[] }) {
  const { t } = useTranslation('widgets/ConnectionSummary');
  const bars: SummaryBar[] = KIND_VIEW.flatMap((view) => {
    const share = shares.find((entry) => entry.key === view.kind);

    if (share === undefined) {
      return [];
    }

    return [
      {
        key: view.kind,
        label: t(view.label, { ns: 'shared' }),
        value: share.volume,
        caption: t('count.connection', { ns: 'shared', count: share.count }),
        tone: view.tone,
      },
    ];
  });

  return (
    <ConnectionSummaryPanel title={t('action.title')}>
      <ConnectionSummaryBars bars={bars} empty={t('empty')} format={formatBytes} />
    </ConnectionSummaryPanel>
  );
}
