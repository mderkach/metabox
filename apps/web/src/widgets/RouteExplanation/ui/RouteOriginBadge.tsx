import { ROUTE_ORIGIN, type RouteOrigin } from '@entities/Route';
import { Badge } from '@shared/ui';

const ORIGIN_LABEL: Readonly<Record<RouteOrigin, string>> = {
  [ROUTE_ORIGIN.Observed]: 'от core',
  [ROUTE_ORIGIN.Computed]: 'вычислено',
  [ROUTE_ORIGIN.Unknown]: 'неизвестно',
};

/**
 * Наблюдение и вычисленное различаются на экране, а не только в ответе API:
 * прогноз, поданный как факт, — самый дорогой класс ошибок для панели, чья
 * ценность в доверии к объяснению (ADR-0007).
 */
export function RouteOriginBadge({ origin }: { origin: RouteOrigin }) {
  return <Badge variant={origin === ROUTE_ORIGIN.Observed ? 'secondary' : 'outline'}>{ORIGIN_LABEL[origin]}</Badge>;
}
