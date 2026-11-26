import type { ParseKeys } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ROUTE_KIND, type ConnectionShare, type RouteKind } from '@entities/Connection';
import { SHARED_NS } from '@shared/i18n';
import { formatBytes } from '@shared/lib/format';

import { CONNECTION_SUMMARY_NS } from '../i18n/ConnectionSummary.namespace.generated';
import { ConnectionSummaryBars, type SummaryBar } from './ConnectionSummaryBars';
import { ConnectionSummaryPanel } from './ConnectionSummaryPanel';

/** Row order is fixed: by load it is not stable. */
const KIND_VIEW = [
  { kind: ROUTE_KIND.Proxy, label: 'route.proxy', tone: 'bg-route-proxy' },
  { kind: ROUTE_KIND.Direct, label: 'route.direct', tone: 'bg-route-direct' },
  { kind: ROUTE_KIND.Block, label: 'route.block', tone: 'bg-route-block' },
  { kind: ROUTE_KIND.Dns, label: 'route.dns', tone: 'bg-route-dns' },
  { kind: ROUTE_KIND.Other, label: 'route.other', tone: 'bg-route-neutral' },
] as const satisfies readonly { kind: RouteKind; label: ParseKeys<typeof SHARED_NS>; tone: string }[];

/** A bar as long as the traffic volume, not the connection count: a silent connection stays in the list but adds no weight. */
export function ConnectionSummaryAction({
  shares,
  placeholder,
}: {
  shares: ConnectionShare<RouteKind>[];
  /** Replaces the card body when the page knows the data is missing or still loading. */
  placeholder?: ReactNode;
}) {
  const { t } = useTranslation(CONNECTION_SUMMARY_NS);
  const bars: SummaryBar[] = KIND_VIEW.flatMap((view) => {
    const share = shares.find((entry) => entry.key === view.kind);

    if (share === undefined) {
      return [];
    }

    return [
      {
        key: view.kind,
        label: t(view.label, { ns: SHARED_NS }),
        value: share.volume,
        caption: t('count.connection', { ns: SHARED_NS, count: share.count }),
        tone: view.tone,
      },
    ];
  });

  return (
    <ConnectionSummaryPanel title={t('action.title')}>
      {placeholder ?? <ConnectionSummaryBars bars={bars} empty={t('empty')} format={formatBytes} />}
    </ConnectionSummaryPanel>
  );
}
