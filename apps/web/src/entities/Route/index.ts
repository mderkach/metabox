export { ROUTE_ENDPOINT } from './api/Route.endpoints';
export {
  getRouteExplanationOptions,
  getRuleHitsOptions,
  ROUTE_QUERY,
  useRouteExplanation,
  useRuleHits,
} from './api/Route.query';
export { toRouteExplanation, toRuleHits } from './model/Route.adapter';
export { ROUTE_MATCH, ROUTE_ORIGIN } from './model/Route.model';
export type {
  RouteExplanation,
  RouteMatch,
  RouteMatchKind,
  RouteOrigin,
  RouteReasonCode,
  RouteRule,
  RuleHits,
} from './model/Route.model';
