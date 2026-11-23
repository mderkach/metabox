import { describe, expect, it } from 'vitest';

import { simpleMoveLimit } from '../model/SimpleRoutes.order';

const GENERAL = { rule_set: 'media', outbound: 'shared-exit' };
const EXCEPTION = { ...GENERAL, source_ip_cidr: '192.0.2.17', outbound: 'device-exit' };
const UNRELATED = { domain: 'other.example', outbound: 'direct' };

describe('rule order in Simple', () => {
  it('protects a device exception when either it or its covering rule is moved', () => {
    expect(simpleMoveLimit([EXCEPTION, GENERAL], 1, 2)).toEqual({ reason: 'covers', index: 2 });
    expect(simpleMoveLimit([EXCEPTION, GENERAL], 2, 1)).toEqual({ reason: 'covers', index: 1 });
    expect(simpleMoveLimit([GENERAL, EXCEPTION], 2, 1)).toBeNull();
  });

  it('checks every crossed rule even when the source and drop target are disjoint', () => {
    const source = { domain: 'docs.example', outbound: 'work' };
    expect(simpleMoveLimit([source, GENERAL, UNRELATED], 1, 3)).toEqual({ reason: 'unknown', index: 2 });
    expect(simpleMoveLimit([source, { action: 'sniff' }, UNRELATED], 1, 3)).toEqual({
      reason: 'advancedMove',
      index: 2,
    });
    expect(simpleMoveLimit([source, UNRELATED], 1, 2)).toBeNull();
  });
});
