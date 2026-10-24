import { describe, expect, it } from 'vitest';

import { findReferences } from '../model/Config.references';

const CONFIG = JSON.stringify({
  outbounds: [
    { type: 'direct', tag: 'direct' },
    { type: 'vless', tag: 'nl', server: 'nl.example' },
    { type: 'vless', tag: 'de', server: 'nl', detour: 'direct' },
    { type: 'urltest', tag: 'auto', outbounds: ['nl', 'direct'] },
  ],
  route: {
    rules: [
      { domain: ['a.example'], outbound: 'nl' },
      { type: 'logical', mode: 'and', rules: [{ rule_set: ['ads'] }, { domain: ['nl'] }], outbound: 'direct' },
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
      { kind: 'rule', index: 4 },
      { kind: 'setting', path: 'route.final' },
    ]);
  });

  it('skips a field that holds the same string but is not a tag reference', () => {
    const references = findReferences(CONFIG, 'nl');

    expect(references).not.toContainEqual({ kind: 'node', section: 'outbounds', name: 'de' });
    expect(references).not.toContainEqual({ kind: 'rule', index: 2 });
  });

  it('follows references into nested logical rules', () => {
    expect(findReferences(CONFIG, 'ads')).toEqual([{ kind: 'rule', index: 2 }]);
  });

  it('does not count the node own tag or a type of the same name', () => {
    expect(findReferences(CONFIG, 'direct')).toEqual([
      { kind: 'node', section: 'outbounds', name: 'de' },
      { kind: 'node', section: 'outbounds', name: 'auto' },
      { kind: 'rule', index: 2 },
      { kind: 'rule', index: 3 },
    ]);
  });

  it('names a fallback group whose member is the tag', () => {
    const config = JSON.stringify({
      outbounds: [
        { type: 'vless', tag: 'nl', server: 'nl.example' },
        { type: 'fallback', tag: 'backup', outbounds: ['nl'] },
      ],
    });

    expect(findReferences(config, 'nl')).toEqual([{ kind: 'node', section: 'outbounds', name: 'backup' }]);
  });

  it('follows fields the fork leaves without a reference mark', () => {
    const config = JSON.stringify({
      outbounds: [{ type: 'vless', tag: 'nl', server: 'nl.example' }],
      experimental: { v2ray_api: { stats: { enabled: true, outbounds: ['nl'] } } },
    });

    expect(findReferences(config, 'nl')).toEqual([{ kind: 'setting', path: 'experimental.v2ray_api.stats.outbounds' }]);
  });

  it('finds nothing for a node nobody points to', () => {
    expect(findReferences(CONFIG, 'auto')).toEqual([]);
  });
});
