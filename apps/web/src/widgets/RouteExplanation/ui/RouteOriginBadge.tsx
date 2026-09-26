import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ROUTE_ORIGIN, type RouteOrigin } from '@entities/Route';
import { Badge } from '@shared/ui';

const ORIGIN_LABEL = {
  [ROUTE_ORIGIN.Observed]: 'origin.observed',
  [ROUTE_ORIGIN.Computed]: 'origin.computed',
  [ROUTE_ORIGIN.Unknown]: 'origin.unknown',
} as const satisfies Readonly<Record<RouteOrigin, ParseKeys<'widgets/RouteExplanation'>>>;

/**
 * Наблюдение и вычисленное различаются на экране, а не только в ответе API:
 * прогноз, поданный как факт, — самый дорогой класс ошибок для панели, чья
 * ценность в доверии к объяснению.
 */
export function RouteOriginBadge({ origin }: { origin: RouteOrigin }) {
  const { t } = useTranslation('widgets/RouteExplanation');

  return <Badge variant={origin === ROUTE_ORIGIN.Observed ? 'secondary' : 'outline'}>{t(ORIGIN_LABEL[origin])}</Badge>;
}
