import { describe, expect, it } from 'vitest';

import { FINAL_OUTCOME, ROUTE_KIND, toRouteKind } from '../model/Connection.model';

describe('toRouteKind', () => {
  it('читает исход по подстроке рантайма', () => {
    expect(toRouteKind('route(direct)')).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind('route(proxy)')).toBe(ROUTE_KIND.Proxy);
    expect(toRouteKind('hijack-dns')).toBe(ROUTE_KIND.Dns);
    expect(toRouteKind('reject')).toBe(ROUTE_KIND.Block);
  });

  it('блок проверяет раньше общего маршрута', () => {
    expect(toRouteKind('route(block-out)')).toBe(ROUTE_KIND.Block);
  });

  // ADR-0007: у соединения без правила условий нет, и судьбу показывает цепочка.
  it('у соединения без правила исход читает по цепочке', () => {
    expect(toRouteKind(FINAL_OUTCOME, ['direct'])).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind(FINAL_OUTCOME, ['proxy', 'sub/node'])).toBe(ROUTE_KIND.Proxy);
  });

  it('без правила и без цепочки исход не выдумывает', () => {
    expect(toRouteKind(FINAL_OUTCOME)).toBe(ROUTE_KIND.Other);
    expect(toRouteKind('sniff')).toBe(ROUTE_KIND.Other);
  });
});
