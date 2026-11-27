import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Badge } from '@shared/ui';

import { ROUTE_NS } from '../i18n/Route.namespace.generated';
import { ROUTE_ORIGIN, type RouteOrigin } from '../model/Route.model';

const ORIGIN_LABEL = {
  [ROUTE_ORIGIN.Observed]: 'origin.observed',
  [ROUTE_ORIGIN.Computed]: 'origin.computed',
  [ROUTE_ORIGIN.Unknown]: 'origin.unknown',
} as const satisfies Readonly<Record<RouteOrigin, ParseKeys<typeof ROUTE_NS>>>;

/**
 * Observed and computed are told apart on screen, not only in the API response:
 * a forecast presented as fact is the costliest class of errors for a panel whose
 * value is trust in the explanation.
 */
export function RouteOriginBadge({ origin }: { origin: RouteOrigin }) {
  const { t } = useTranslation(ROUTE_NS);

  return <Badge variant={origin === ROUTE_ORIGIN.Observed ? 'secondary' : 'outline'}>{t(ORIGIN_LABEL[origin])}</Badge>;
}
