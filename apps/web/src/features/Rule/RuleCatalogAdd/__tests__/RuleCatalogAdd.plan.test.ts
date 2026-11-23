import { describe, expect, it } from 'vitest';

import { findValue, setValue } from '@entities/Config';
import type { RuleSetList } from '@entities/RuleSet';

import { getCatalogResolvers, planCatalogService, type CatalogSelection } from '../model/RuleCatalogAdd.plan';

const LIST: RuleSetList = {
  kind: 'geosite',
  prefix: 'geosite-',
  featured: ['video'],
  categories: ['video', 'music'],
  source: 'snapshot',
  updatedAt: null,
  mirrors: [
    { id: 'main', name: 'Main', base: 'https://catalog.test/' },
    { id: 'mirror', name: 'Mirror', base: 'https://mirror.test/' },
  ],
};
const SET = { type: 'remote', tag: 'custom-video', url: 'https://mirror.test/geosite-video.srs' };
const HIJACK = { inbound: ['queries'], action: 'hijack-dns' };
const DIRECT_RULE = { rule_set: [SET.tag], action: 'route', outbound: 'direct' };
const DNS_RULE = { rule_set: [SET.tag], action: 'route', server: 'local' };
const SERVERS = [
  { type: 'tcp', tag: 'local', server: '192.0.2.1' },
  { type: 'tcp', tag: 'explicit-direct', server: '192.0.2.1', detour: 'direct' },
  { type: 'tcp', tag: 'group-dns', server: '192.0.2.2', detour: 'group' },
  { type: 'tcp', tag: 'relay-dns', server: '192.0.2.3', detour: 'relay' },
];
const OUTBOUNDS = [
  { type: 'direct', tag: 'direct' },
  { type: 'socks', tag: 'relay', server: '192.0.2.4', server_port: 1080 },
  { type: 'selector', tag: 'group', outbounds: ['relay'] },
];
const TEXT = JSON.stringify(
  {
    inbounds: [
      { type: 'socks', tag: 'client', listen_port: 1080 },
      { type: 'direct', tag: 'queries', listen_port: 1053 },
    ],
    outbounds: OUTBOUNDS,
    dns: { servers: SERVERS, final: 'local' },
    route: { rules: [HIJACK], final: 'group' },
  },
  null,
  2
).replace('  "inbounds"', '  // keep the operator note\n  "inbounds"');

function preview(text = TEXT, fields: Partial<CatalogSelection> = {}) {
  return planCatalogService({
    text,
    coreVersion: '1.14.3-extended-2.7.3',
    list: LIST,
    category: 'video',
    outbound: 'direct',
    resolver: 'local',
    ...fields,
  });
}

describe('catalog route and DNS preview', () => {
  it.each([
    ['direct', 'local'],
    ['direct', 'explicit-direct'],
    ['group', 'group-dns'],
    ['relay', 'relay-dns'],
  ])('builds a complete pair for %s with %s and keeps both final paths', (outbound, resolver) => {
    const result = preview(TEXT, { outbound, resolver });
    expect(result).toMatchObject({
      ok: true,
      addSet: true,
      route: { position: 2, reused: false },
      dns: { position: 1, reused: false },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(findValue(result.text, ['route', 'rule_set', 0])).toMatchObject({
      tag: 'geosite-video',
      url: 'https://catalog.test/geosite-video.srs',
    });
    expect(findValue(result.text, ['route', 'rules'])).toEqual([
      HIJACK,
      { action: 'route', rule_set: ['geosite-video'], outbound },
    ]);
    expect(findValue(result.text, ['dns', 'rules'])).toEqual([
      { action: 'route', rule_set: ['geosite-video'], server: resolver },
    ]);
    expect(findValue(result.text, ['route', 'final'])).toBe('group');
    expect(findValue(result.text, ['dns', 'final'])).toBe('local');
    expect(result.text).toContain('// keep the operator note');
    expect(preview(result.text, { outbound, resolver: '' })).toMatchObject({
      ok: true,
      text: result.text,
      addSet: false,
      route: { reused: true },
      dns: { reused: true },
      resolver,
    });
  });

  it('reuses an exact catalog mirror under its actual tag and retains a compatible shared DNS row', () => {
    const shared = { rule_set: ['sibling', SET.tag], server: 'local' };
    let text = setValue(
      TEXT,
      ['route', 'rule_set'],
      [SET, { type: 'inline', tag: 'sibling', rules: [{ domain: ['sibling.test'] }] }]
    );
    text = setValue(text, ['dns', 'rules'], [shared, { action: 'reject', domain_suffix: ['untouched.test'] }]);
    const result = preview(text, { resolver: '' });
    if (!result.ok) throw new Error(result.reason);
    expect(result).toMatchObject({
      setTag: SET.tag,
      addSet: false,
      route: { reused: false },
      dns: { position: 1, reused: true },
    });
    expect(findValue(result.text, ['dns'])).toEqual(findValue(text, ['dns']));
    expect(findValue(result.text, ['route', 'rule_set'])).toEqual(findValue(text, ['route', 'rule_set']));
    expect(preview(text, { resolver: 'explicit-direct' })).toEqual({ ok: false, reason: 'dnsConflict', detail: '1' });
  });

  it('preserves an effective route and inserts only its DNS counterpart', () => {
    let text = setValue(TEXT, ['route', 'rule_set'], [SET]);
    text = setValue(text, ['route', 'rules'], [HIJACK, DIRECT_RULE, { action: 'reject', domain: ['later.test'] }]);
    const result = preview(text);
    if (!result.ok) throw new Error(result.reason);
    expect(result.route).toEqual({ position: 2, reused: true });
    expect(findValue(result.text, ['route'])).toEqual(findValue(text, ['route']));
    expect(findValue(result.text, ['dns', 'rules'])).toEqual([DNS_RULE]);
  });

  it('does not infer an assignment from finals or a singleton, or use a different detour', () => {
    const text = setValue(TEXT, ['dns', 'servers'], [SERVERS[0]]);
    expect(preview(text, { resolver: '' })).toMatchObject({ ok: false, reason: 'resolver' });
    expect(preview(TEXT, { outbound: 'relay', resolver: 'group-dns' })).toMatchObject({
      ok: false,
      reason: 'resolver',
    });
    expect(preview(text, { outbound: 'relay', resolver: 'relay-dns' })).toMatchObject({
      ok: false,
      reason: 'resolver',
    });
    expect(
      preview(setValue(text, ['dns', 'servers'], [SERVERS[0], SERVERS[3]]), {
        outbound: 'relay',
        resolver: 'relay-dns',
      })
    ).toMatchObject({ ok: true });
  });

  it.each([
    { type: 'https', tag: 'local', server: '192.0.2.1' },
    { type: 'tcp', tag: 'local', server: 'resolver.test' },
    { type: 'tcp', tag: 'local', server: '999.2.3.4' },
    { ...SERVERS[0], bind_interface: 'custom' },
    { ...SERVERS[0], detour: 'group' },
    { ...SERVERS[0], server_port: 0 },
  ])('excludes an unsupported DNS transport or path %#', (server) => {
    expect(getCatalogResolvers(setValue(TEXT, ['dns', 'servers'], [server]), 'direct')).toEqual([]);
  });

  it.each([
    [{ ...OUTBOUNDS[0], routing_mark: 42 }, 'direct'],
    [{ ...OUTBOUNDS[1], version: '4' }, 'relay'],
    [{ ...OUTBOUNDS[1], server: 'relay.test' }, 'relay'],
    [{ ...OUTBOUNDS[2], use_all_providers: true }, 'group'],
    [{ ...OUTBOUNDS[2], outbounds: ['missing'] }, 'group'],
    [{ ...OUTBOUNDS[2], default: 'missing' }, 'group'],
  ] as const)('blocks an unsupported exit or selector member %#', (exit, outbound) => {
    const text = setValue(TEXT, ['outbounds'], [...OUTBOUNDS.filter((node) => node.tag !== outbound), exit]);
    expect(preview(text, { outbound })).toMatchObject({ ok: false, reason: 'exit' });
  });

  it('reports independent effective positions and rejects a partial or shadowed match', () => {
    const withSet = setValue(TEXT, ['route', 'rule_set'], [SET]);
    expect(
      preview(
        setValue(
          withSet,
          ['route', 'rules'],
          [HIJACK, { domain_suffix: ['video.test'], outbound: 'relay' }, DIRECT_RULE]
        )
      )
    ).toEqual({ ok: false, reason: 'routeConflict', detail: '2' });
    expect(preview(setValue(withSet, ['dns', 'rules'], [{ ...DNS_RULE, query_type: ['A'] }, DNS_RULE]))).toEqual({
      ok: false,
      reason: 'dnsConflict',
      detail: '1',
    });
    expect(
      preview(setValue(withSet, ['dns', 'rules'], [{ rule_set: ['other'], server: 'group-dns' }, DNS_RULE]))
    ).toEqual({ ok: false, reason: 'dnsConflict', detail: '1' });
  });

  it('blocks malformed, duplicate or ambiguous source definitions and reserved provider tags', () => {
    for (const sets of [
      [SET, { ...SET, tag: 'another' }],
      [{ ...SET, tag: 'geosite-video', url: 'https://other.test/geosite-video.srs' }],
      [{ ...SET, initial_path: 'other.srs' }],
    ]) {
      expect(preview(setValue(TEXT, ['route', 'rule_set'], sets))).toMatchObject({ ok: false, reason: 'setConflict' });
    }
    expect(
      preview(setValue(TEXT, ['providers'], [{ type: 'remote', tag: 'geosite-video', url: 'https://other.test/sub' }]))
    ).toMatchObject({ ok: false, reason: 'setConflict' });
    expect(preview(setValue(TEXT, ['dns', 'rules'], [{ ...DNS_RULE, rule_set: ['geosite-video'] }]))).toMatchObject({
      ok: false,
      reason: 'setConflict',
    });
    expect(preview(TEXT.replace('"inbounds"', '"inbounds": [], "inbounds"'))).toMatchObject({
      ok: false,
      reason: 'draft',
    });
    expect(preview('{')).toMatchObject({ ok: false, reason: 'draft' });
  });

  it.each([
    ['endpoints', 'warp', []],
    ['outbounds', 'masque', OUTBOUNDS],
  ] as const)('reserves %s profile cache tags for both new and existing catalog sets', (section, type, prior) => {
    for (const set of [undefined, SET]) {
      const tag = set?.tag ?? 'geosite-video';
      const base = set === undefined ? TEXT : setValue(TEXT, ['route', 'rule_set'], [set]);
      const withProfile = (profileTag: string) => setValue(base, [section], [...prior, { type, tag: profileTag }]);

      expect(preview(withProfile(tag))).toEqual({ ok: false, reason: 'setConflict', detail: tag });
      expect(preview(withProfile('separate-profile'))).toMatchObject({ ok: true, setTag: tag });
    }

    const implicitTag = String(prior.length);
    const base = setValue(TEXT, ['route', 'rule_set'], [{ ...SET, tag: implicitTag }]);
    expect(preview(setValue(base, [section], [...prior, { type }]))).toEqual({
      ok: false,
      reason: 'setConflict',
      detail: implicitTag,
    });
  });

  it('refuses extra opaque ingress or global path overrides', () => {
    expect(preview(setValue(TEXT, ['inbounds', 2], { type: 'redirect', tag: 'lan', listen_port: 1234 }))).toMatchObject(
      { ok: false, reason: 'ingress' }
    );
    expect(preview(setValue(TEXT, ['route', 'default_interface'], 'alt'))).toEqual({
      ok: false,
      reason: 'draft',
      detail: 'route.default_interface',
    });
    expect(preview(setValue(TEXT, ['dns', 'strategy'], 'ipv6_only'))).toEqual({
      ok: false,
      reason: 'draft',
      detail: 'dns.strategy',
    });
  });

  it('requires the proven core, catalog category and both ingress paths', () => {
    expect(preview(TEXT, { coreVersion: undefined })).toMatchObject({ ok: false, reason: 'core' });
    expect(preview(TEXT, { coreVersion: '1.14.4-extended-2.7.4' })).toMatchObject({ ok: false, reason: 'core' });
    expect(preview(TEXT, { category: 'missing' })).toMatchObject({ ok: false, reason: 'service' });
    expect(preview(TEXT, { list: { ...LIST, kind: 'geoip' } })).toMatchObject({ ok: false, reason: 'service' });
    expect(preview(setValue(TEXT, ['route', 'rules'], []))).toMatchObject({ ok: false, reason: 'ingress' });
    expect(preview(setValue(TEXT, ['inbounds', 0, 'type'], 'redirect'))).toMatchObject({
      ok: false,
      reason: 'ingress',
    });
    expect(preview(setValue(TEXT, ['inbounds', 1, 'network'], 'tcp'))).toMatchObject({ ok: false, reason: 'ingress' });
  });
});
