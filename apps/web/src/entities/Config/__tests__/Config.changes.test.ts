import { describe, expect, it } from 'vitest';

import { toConfigChanges } from '../model/Config.changes';

function toText(config: unknown): string {
  return JSON.stringify(config, null, 2);
}

const APPLIED = {
  outbounds: [
    { type: 'direct', tag: 'direct' },
    { type: 'vless', tag: 'proxy', server: 'a.example', server_port: 443 },
    { type: 'block', tag: 'old' },
  ],
  route: { rules: [{ domain: ['a.example'], outbound: 'proxy' }], default_mark: 100 },
};

describe('toConfigChanges', () => {
  it('names nodes by tag: added, removed and changed with the keys that changed', () => {
    const draft = {
      ...APPLIED,
      outbounds: [
        { type: 'direct', tag: 'direct' },
        { type: 'vless', tag: 'proxy', server: 'b.example', server_port: 8443 },
        { type: 'vless', tag: 'NL test', server: 'nl.example' },
      ],
    };

    expect(toConfigChanges(toText(APPLIED), toText(draft))).toEqual([
      { kind: 'changed', section: 'outbounds', name: 'proxy', fields: ['server', 'server_port'] },
      { kind: 'added', section: 'outbounds', name: 'NL test' },
      { kind: 'removed', section: 'outbounds', name: 'old' },
    ]);
  });

  it('names a value outside node lists by its path, with both values and its screen', () => {
    const draft = { ...APPLIED, route: { ...APPLIED.route, default_mark: 7 }, log: { level: 'debug' } };

    expect(toConfigChanges(toText(APPLIED), toText(draft))).toEqual([
      { kind: 'setting', section: 'route', path: 'route.default_mark', from: 100, to: 7 },
      { kind: 'setting', section: 'log', path: 'log', from: undefined, to: { level: 'debug' } },
    ]);
  });

  it('leaves routing rules to their own summary', () => {
    const draft = { ...APPLIED, route: { ...APPLIED.route, rules: [] } };

    expect(toConfigChanges(toText(APPLIED), toText(draft))).toEqual([]);
  });

  it('names an untagged node by its number', () => {
    const applied = { dns: { rules: [{ domain: ['a.example'], server: 'local' }] } };
    const draft = { dns: { rules: [{ domain: ['b.example'], server: 'local' }] } };

    expect(toConfigChanges(toText(applied), toText(draft))).toEqual([
      { kind: 'changed', section: 'dnsRules', name: '1', fields: ['domain'] },
    ]);
  });

  it('gives nothing when a root is not an object', () => {
    expect(toConfigChanges('[]', toText(APPLIED))).toEqual([]);
  });
});
