import { ROUTE_KIND, type RouteKind } from '@entities/Connection';

/**
 * Outbound color. The outbound itself is parsed by the connection slice — here is only the
 * "packet fate → tone" table: keeping a second substring table alongside
 * would mean fixing the parsing in two places.
 */
const KIND_TONES: Readonly<Record<RouteKind, string>> = {
  [ROUTE_KIND.Direct]: 'text-route-direct',
  [ROUTE_KIND.Proxy]: 'text-route-proxy',
  [ROUTE_KIND.Block]: 'text-route-block',
  [ROUTE_KIND.Dns]: 'text-route-dns',
  [ROUTE_KIND.Other]: 'text-route-neutral',
};

export function toActionTone(kind: RouteKind): string {
  return KIND_TONES[kind];
}
