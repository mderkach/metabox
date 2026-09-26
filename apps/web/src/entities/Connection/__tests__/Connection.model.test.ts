import { describe, expect, it } from 'vitest';

import { FINAL_ACTION, ROUTE_KIND, toRouteKind } from '../model/Connection.model';

describe('toRouteKind', () => {
  it('читает выход по подстроке рантайма', () => {
    expect(toRouteKind('route(direct)')).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind('route(proxy)')).toBe(ROUTE_KIND.Proxy);
    expect(toRouteKind('hijack-dns')).toBe(ROUTE_KIND.Dns);
    expect(toRouteKind('reject')).toBe(ROUTE_KIND.Block);
  });

  it('блок проверяет раньше общего маршрута', () => {
    expect(toRouteKind('route(block-out)')).toBe(ROUTE_KIND.Block);
  });

  // У соединения без правила условий нет, и судьбу показывает цепочка.
  it('у соединения без правила выход читает по цепочке', () => {
    expect(toRouteKind(FINAL_ACTION, ['direct'])).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind(FINAL_ACTION, ['proxy', 'sub/node'])).toBe(ROUTE_KIND.Proxy);
  });

  it('без правила и без цепочки выход не выдумывает', () => {
    expect(toRouteKind(FINAL_ACTION)).toBe(ROUTE_KIND.Other);
    expect(toRouteKind('sniff')).toBe(ROUTE_KIND.Other);
  });
});

describe('toRouteKind по типам аутбаундов', () => {
  const OUTBOUND_TYPES = new Map([
    ['directional', 'vless'],
    ['direct-ru', 'direct'],
    ['guard', 'block'],
  ]);

  it('тип узла важнее его имени', () => {
    expect(toRouteKind('route(directional)', ['directional'], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Proxy);
    expect(toRouteKind('route(direct-ru)', ['direct-ru'], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind('route(guard)', ['guard'], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Block);
  });

  it('без карты читает по подстроке', () => {
    expect(toRouteKind('route(directional)', ['directional'])).toBe(ROUTE_KIND.Direct);
  });

  it('незнакомый тип выводит трафик через узел', () => {
    expect(toRouteKind('route(edge)', [], new Map([['edge', 'sudoku']]))).toBe(ROUTE_KIND.Proxy);
  });

  it('тега нет в конфиге — возвращается к таблице подстрок', () => {
    expect(toRouteKind('route(sub-a/direct-node)', [], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind('route(us-west-01)', [], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Proxy);
  });

  it('у соединения без правила тип берёт из цепочки', () => {
    const types = new Map([
      ['final-selector', 'selector'],
      ['lan', 'direct'],
    ]);

    expect(toRouteKind(FINAL_ACTION, ['final-selector', 'sub-a/node'], types)).toBe(ROUTE_KIND.Proxy);
    expect(toRouteKind(FINAL_ACTION, ['lan'], types)).toBe(ROUTE_KIND.Direct);
  });

  it('цепочки нет в конфиге — выход читает по её узлам', () => {
    expect(toRouteKind(FINAL_ACTION, ['direct'], new Map([['proxy', 'urltest']]))).toBe(ROUTE_KIND.Direct);
  });
});
