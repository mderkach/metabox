import { describe, expect, it } from 'vitest';

import { FINAL_ACTION, ROUTE_KIND, toRouteKind } from '../model/Connection.model';

describe('toRouteKind', () => {
  it('reads the outbound by a runtime substring', () => {
    expect(toRouteKind('route(direct)')).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind('route(proxy)')).toBe(ROUTE_KIND.Proxy);
    expect(toRouteKind('hijack-dns')).toBe(ROUTE_KIND.Dns);
    expect(toRouteKind('reject')).toBe(ROUTE_KIND.Block);
  });

  it('checks block before the general route', () => {
    expect(toRouteKind('route(block-out)')).toBe(ROUTE_KIND.Block);
  });

  // A connection without a rule has no conditions, and the chain shows its fate.
  it('for a connection without a rule reads the outbound from the chain', () => {
    expect(toRouteKind(FINAL_ACTION, ['direct'])).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind(FINAL_ACTION, ['proxy', 'sub/node'])).toBe(ROUTE_KIND.Proxy);
  });

  it('without a rule and without a chain does not invent an outbound', () => {
    expect(toRouteKind(FINAL_ACTION)).toBe(ROUTE_KIND.Other);
    expect(toRouteKind('sniff')).toBe(ROUTE_KIND.Other);
  });
});

describe('toRouteKind by outbound types', () => {
  const OUTBOUND_TYPES = new Map([
    ['directional', 'vless'],
    ['direct-ru', 'direct'],
    ['guard', 'block'],
  ]);

  it('node type is more important than its name', () => {
    expect(toRouteKind('route(directional)', ['directional'], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Proxy);
    expect(toRouteKind('route(direct-ru)', ['direct-ru'], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind('route(guard)', ['guard'], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Block);
  });

  it('without a map reads by substring', () => {
    expect(toRouteKind('route(directional)', ['directional'])).toBe(ROUTE_KIND.Direct);
  });

  it('an unknown type routes traffic through a node', () => {
    expect(toRouteKind('route(edge)', [], new Map([['edge', 'sudoku']]))).toBe(ROUTE_KIND.Proxy);
  });

  it('tag not in the config: falls back to the substring table', () => {
    expect(toRouteKind('route(sub-a/direct-node)', [], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Direct);
    expect(toRouteKind('route(us-west-01)', [], OUTBOUND_TYPES)).toBe(ROUTE_KIND.Proxy);
  });

  it('for a connection without a rule takes the type from the chain', () => {
    const types = new Map([
      ['final-selector', 'selector'],
      ['lan', 'direct'],
    ]);

    expect(toRouteKind(FINAL_ACTION, ['final-selector', 'sub-a/node'], types)).toBe(ROUTE_KIND.Proxy);
    expect(toRouteKind(FINAL_ACTION, ['lan'], types)).toBe(ROUTE_KIND.Direct);
  });

  it('chain not in the config: reads the outbound from its nodes', () => {
    expect(toRouteKind(FINAL_ACTION, ['direct'], new Map([['proxy', 'urltest']]))).toBe(ROUTE_KIND.Direct);
  });
});
