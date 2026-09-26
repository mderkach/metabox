import { ROUTE_KIND, type RouteKind } from '@entities/Connection';

/**
 * Цвет выхода. Сам выход разбирает слайс соединения — здесь только таблица
 * «судьба пакета → тон»: держать вторую таблицу подстрок рядом
 * значило бы чинить разбор в двух местах.
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
