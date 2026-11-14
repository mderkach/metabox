import { describe, expect, it } from 'vitest';

import type { ProxyProvider } from '../model/Proxy.model';
import { NODE_DROP, observeProviders, toNodeDrop, toProviderNodeChange } from '../model/Proxy.nodeDrop';

function provider(name: string, nodes: number, raw: string): ProxyProvider {
  return { name, nodes, update: { kind: 'at', at: new Date(raw), raw }, usage: null, expiresAt: null };
}

const FIRST = '2026-09-10T12:00:00Z';
const SECOND = '2026-09-11T12:00:00Z';

describe('toNodeDrop', () => {
  it.each([
    [6, 2],
    [12, 1],
    [3, 1],
    [100, 2],
  ])('warns when %i nodes collapse to %i', (before, after) => {
    expect(toNodeDrop(before, after)).toBe(NODE_DROP.Collapsed);
  });

  it.each([
    [2, 1],
    [5, 2],
    [40, 12],
    [12, 12],
    [1, 2],
  ])('stays quiet on %i → %i', (before, after) => {
    expect(toNodeDrop(before, after)).toBe(NODE_DROP.None);
  });

  it('treats no nodes as empty, with or without a count seen before', () => {
    expect(toNodeDrop(12, 0)).toBe(NODE_DROP.Empty);
    expect(toNodeDrop(null, 0)).toBe(NODE_DROP.Empty);
  });

  it('does not call a set collapsed without a count to compare with', () => {
    expect(toNodeDrop(null, 1)).toBe(NODE_DROP.None);
  });
});

describe('observeProviders', () => {
  it('remembers a subscription seen the first time without a previous count', () => {
    expect(observeProviders({}, [provider('sub', 6, FIRST)])).toEqual({
      sub: { nodes: 6, updatedAt: FIRST, previous: null },
    });
  });

  it('returns the same record when nothing changed', () => {
    const seen = observeProviders({}, [provider('sub', 6, FIRST)]);

    expect(observeProviders(seen, [provider('sub', 6, FIRST)])).toBe(seen);
  });

  it('keeps the count seen so far as previous when the subscription updates', () => {
    const seen = observeProviders({}, [provider('sub', 6, FIRST)]);

    expect(observeProviders(seen, [provider('sub', 1, SECOND)]).sub).toEqual({
      nodes: 1,
      updatedAt: SECOND,
      previous: 6,
    });
  });

  it('a later healthy update clears the drop', () => {
    const dropped = observeProviders(observeProviders({}, [provider('sub', 6, FIRST)]), [provider('sub', 1, SECOND)]);
    const healed = observeProviders(dropped, [provider('sub', 1, '2026-09-12T12:00:00Z')]);

    expect(toProviderNodeChange(healed.sub, 1).drop).toBe(NODE_DROP.None);
  });

  it('counts a changed node count as an update even when the time did not move', () => {
    const seen = observeProviders({}, [provider('sub', 6, FIRST)]);

    expect(observeProviders(seen, [provider('sub', 0, FIRST)]).sub.previous).toBe(6);
  });

  it('forgets subscriptions that left the list', () => {
    const seen = observeProviders({}, [provider('a', 2, FIRST), provider('b', 2, FIRST)]);

    expect(Object.keys(observeProviders(seen, [provider('a', 2, FIRST)]))).toEqual(['a']);
  });

  it('treats a never loaded subscription as one with an empty update time', () => {
    const never: ProxyProvider = { ...provider('sub', 0, FIRST), update: { kind: 'never' } };

    expect(observeProviders({}, [never]).sub.updatedAt).toBe('');
  });
});

describe('toProviderNodeChange', () => {
  it('reports the previous and the new count with the drop', () => {
    expect(toProviderNodeChange({ nodes: 2, updatedAt: SECOND, previous: 6 }, 2)).toEqual({
      before: 6,
      after: 2,
      drop: NODE_DROP.Collapsed,
    });
  });

  it('has no previous count for a subscription not seen before', () => {
    expect(toProviderNodeChange(undefined, 4)).toEqual({ before: null, after: 4, drop: NODE_DROP.None });
  });
});
