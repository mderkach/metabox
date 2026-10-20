import { describe, expect, it } from 'vitest';

import { findReferences } from '../model/Config.references';

const CONFIG = JSON.stringify({
  outbounds: [
    { type: 'direct', tag: 'direct' },
    { type: 'vless', tag: 'nl', server: 'nl.example' },
    { type: 'urltest', tag: 'auto', outbounds: ['nl', 'direct'] },
  ],
  route: {
    rules: [
      { domain: ['a.example'], outbound: 'nl' },
      { domain: ['b.example'], outbound: 'direct' },
      { action: 'route', outbound: 'nl' },
    ],
    final: 'nl',
  },
});

describe('findReferences', () => {
  it('names rules, group members and parameters that point to the tag', () => {
    expect(findReferences(CONFIG, 'nl')).toEqual([
      { kind: 'node', section: 'outbounds', name: 'auto' },
      { kind: 'rule', index: 1 },
      { kind: 'rule', index: 3 },
      { kind: 'setting', path: 'route.final' },
    ]);
  });

  it('does not count the node own tag or a type of the same name', () => {
    expect(findReferences(CONFIG, 'direct')).toEqual([
      { kind: 'node', section: 'outbounds', name: 'auto' },
      { kind: 'rule', index: 2 },
    ]);
  });

  it('finds nothing for a node nobody points to', () => {
    expect(findReferences(CONFIG, 'auto')).toEqual([]);
  });
});
