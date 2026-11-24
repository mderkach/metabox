import { describe, expect, it } from 'vitest';

import { findValue, setValue } from '@entities/Config';

import { planDnsAssignment, planDnsServer, readSimpleDns } from '../model/SimpleRoutes.dns';

const VERSION = '1.14.3-extended-2.7.3';
const HIJACK = { inbound: 'queries', action: 'hijack-dns' };
const SERVERS = [
  { type: 'tcp', tag: 'local', server: '192.0.2.1' },
  { type: 'tcp', tag: 'group-dns', server: '192.0.2.2', detour: 'group' },
  { type: 'tcp', tag: 'relay-dns', server: '192.0.2.3', detour: 'relay' },
];
const ROUTES = [
  HIJACK,
  { domain: 'direct.test', outbound: 'direct' },
  { domain: ['alpha.test', 'beta.test'], outbound: 'group' },
  { domain: 'gamma.test', outbound: 'group' },
  { domain: 'relay.test', outbound: 'relay' },
];
const TEXT = JSON.stringify(
  {
    inbounds: [
      { type: 'socks', tag: 'client', listen_port: 1080 },
      { type: 'direct', tag: 'queries', listen_port: 1053 },
    ],
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'socks', tag: 'relay', server: '192.0.2.4', server_port: 1080 },
      { type: 'selector', tag: 'group', outbounds: ['relay'] },
    ],
    dns: { servers: SERVERS, disable_cache: true },
    route: { rules: ROUTES, final: 'group' },
  },
  null,
  2
).replace('  "route"', '  // imported setting\n  "route"');
const FORM = { tag: 'new', address: '192.0.2.50', detour: '' };
const GROUP_DNS = { domain: ['alpha.test', 'beta.test'], server: 'group-dns' };
const RELAY_DNS = { domain: 'relay.test', server: 'relay-dns' };

describe('resolver inventory', () => {
  it('appends only the requested server, leaving it unassigned and keeping the implicit final', () => {
    const add = planDnsServer(TEXT, VERSION, { ...FORM, detour: 'group' });
    if (!add.ok) throw new Error(add.reason);
    expect(findValue(add.text, [])).toEqual({
      ...JSON.parse(TEXT.replace('// imported setting', '')),
      dns: {
        disable_cache: true,
        servers: [...SERVERS, { type: 'tcp', tag: 'new', server: FORM.address, detour: 'group' }],
      },
    });
    expect(add.text).toContain('// imported setting');
    const projection = readSimpleDns(add.text, VERSION);
    expect(projection.inventory.map(({ referenced }) => referenced)).toEqual([true, false, false, false]);
    expect(projection.paths.find(({ tag }) => tag === 'group')).toMatchObject({
      current: null,
      eligible: ['group-dns', 'new'],
    });
  });

  it('recognizes bootstrap, fallback and actual default references independently from exit tags', () => {
    let text = setValue(
      TEXT,
      ['dns', 'servers'],
      [
        ...SERVERS,
        { type: 'tls', tag: 'bootstrap-user', server: 'secret.example', domain_resolver: { server: 'relay-dns' } },
        { type: 'fallback', tag: 'chain', servers: ['local', 'group-dns'] },
        { ...SERVERS[0], tag: 'direct' },
      ]
    );
    text = setValue(text, ['dns', 'final'], 'chain');
    const inventory = readSimpleDns(text, VERSION).inventory;
    expect(inventory.map(({ referenced }) => referenced)).toEqual([true, true, true, false, true, false]);
    expect(inventory[3].address).toBe('');
  });

  it('refuses first-server creation, implicit bootstrap changes, collisions and dangling references', () => {
    expect(planDnsServer('{}', VERSION, FORM)).toEqual({ ok: false, reason: 'firstServer' });
    const singleton = setValue(TEXT, ['dns', 'servers'], [SERVERS[0]]);
    expect(planDnsServer(singleton, VERSION, FORM).ok).toBe(true);
    const hostname = setValue(singleton, ['outbounds', 1, 'server'], 'remote.test');
    expect(planDnsServer(hostname, VERSION, FORM)).toEqual({ ok: false, reason: 'bootstrap' });
    expect(planDnsServer(setValue(hostname, ['route', 'default_domain_resolver'], 'local'), VERSION, FORM).ok).toBe(
      true
    );
    const unnamed = setValue(TEXT, ['dns', 'servers', 1, 'tag'], '');
    expect(planDnsServer(unnamed, VERSION, { ...FORM, tag: '1' })).toEqual({ ok: false, reason: 'tag' });
    expect(planDnsServer(setValue(TEXT, ['dns', 'final'], 'new'), VERSION, FORM)).toEqual({
      ok: false,
      reason: 'draft',
    });
    expect(planDnsServer(setValue(TEXT, ['dns', 'servers', 1, 'tag'], 'local'), VERSION, FORM)).toEqual({
      ok: false,
      reason: 'draft',
    });
  });

  it('requires the verified core, a unique nonempty tag, IPv4 address and a verified detour', () => {
    expect(planDnsServer(TEXT, undefined, FORM)).toEqual({ ok: false, reason: 'core' });
    expect(planDnsServer(TEXT, VERSION, { ...FORM, address: 'dns.test' })).toEqual({ ok: false, reason: 'address' });
    expect(planDnsServer(TEXT, VERSION, { ...FORM, tag: '   ' })).toEqual({ ok: false, reason: 'tag' });
    expect(planDnsServer(TEXT, VERSION, { ...FORM, detour: 'missing' })).toEqual({ ok: false, reason: 'detour' });
  });
});

describe('explicit path assignments for exact destination names', () => {
  it.each([
    ['direct', 'local', ['direct.test']],
    ['group', 'group-dns', ['alpha.test', 'beta.test', 'gamma.test']],
    ['relay', 'relay-dns', ['relay.test']],
  ] as const)('assigns only the configured names routed to %s', (outbound, resolver, domain) => {
    const result = planDnsAssignment(TEXT, VERSION, outbound, resolver);
    if (!result.ok) throw new Error(result.reason);
    expect(findValue(result.text, ['dns', 'rules'])).toEqual([{ domain, action: 'route', server: resolver }]);
    expect(findValue(result.text, ['route'])).toEqual(findValue(TEXT, ['route']));
    expect(findValue(result.text, ['dns', 'servers'])).toEqual(SERVERS);
    expect(readSimpleDns(result.text, VERSION).paths.find(({ tag }) => tag === outbound)?.current).toBe(resolver);
    expect(planDnsAssignment(result.text, VERSION, outbound, resolver)).toEqual(result);
  });

  it('updates an imported rule in place and adds only missing names for the same exit', () => {
    let text = setValue(TEXT, ['dns', 'rules'], [GROUP_DNS, RELAY_DNS]);
    text = text.replace('"server": "group-dns"', '/* keep group */ "server": "group-dns"');
    text = setValue(text, ['dns', 'servers', 3], { ...SERVERS[1], tag: 'second', server: '192.0.2.99' });
    const result = planDnsAssignment(text, VERSION, 'group', 'second');
    if (!result.ok) throw new Error(result.reason);
    expect(result.text).toContain('/* keep group */');
    expect(result.text).toContain('// imported setting');
    expect(findValue(result.text, ['dns', 'rules'])).toEqual([
      { ...GROUP_DNS, server: 'second' },
      RELAY_DNS,
      { domain: ['gamma.test'], action: 'route', server: 'second' },
    ]);
    expect(findValue(result.text, ['dns', 'disable_cache'])).toBe(true);
  });

  it('refuses overlapping, opaque or shared imported conditions without returning partial edits', () => {
    for (const rules of [
      [{ ...GROUP_DNS, domain: ['alpha.test', 'relay.test'] }],
      [GROUP_DNS, { domain_suffix: 'test', action: 'reject' }],
      [{ domain: 'alpha.test', action: 'route', server: 'relay-dns' }],
    ]) {
      expect(planDnsAssignment(setValue(TEXT, ['dns', 'rules'], rules), VERSION, 'group', 'group-dns')).toEqual({
        ok: false,
        reason: 'conflict',
      });
    }
    for (const rule of [
      { domain: 'alpha.test', outbound: 'relay' },
      { rule_set: ['opaque'], outbound: 'group' },
    ]) {
      expect(
        planDnsAssignment(setValue(TEXT, ['route', 'rules'], [...ROUTES, rule]), VERSION, 'group', 'group-dns')
      ).toEqual({ ok: false, reason: 'scope' });
    }
  });

  it('distinguishes mixed and partial explicit assignments and replaces both atomically', () => {
    const base = setValue(TEXT, ['dns', 'servers', 3], { ...SERVERS[1], tag: 'second' });
    for (const rules of [[GROUP_DNS], [GROUP_DNS, { domain: 'gamma.test', server: 'second' }]]) {
      const text = setValue(base, ['dns', 'rules'], rules);
      const path = readSimpleDns(text, VERSION).paths.find(({ tag }) => tag === 'group');
      expect(path).toMatchObject({ current: null, mixed: true, reason: null });
      const next = planDnsAssignment(text, VERSION, 'group', 'second');
      if (!next.ok) throw new Error(next.reason);
      expect(readSimpleDns(next.text, VERSION).paths.find(({ tag }) => tag === 'group')).toMatchObject({
        current: 'second',
        mixed: false,
      });
    }
  });

  it('preserves unrelated opaque fields and only marks their possible resolver references as unknown', () => {
    const text = setValue(TEXT, ['outbounds', 0, 'future_dns'], 'group-dns');
    const add = planDnsServer(text, VERSION, FORM);
    if (!add.ok) throw new Error(add.reason);
    expect(readSimpleDns(add.text, VERSION).inventory.map(({ referenced }) => referenced)).toEqual([
      true,
      null,
      false,
      false,
    ]);
    expect(findValue(add.text, ['outbounds', 0, 'future_dns'])).toBe('group-dns');
    expect(planDnsServer(setValue(TEXT, ['outbounds', 0, 'future_dns'], 'new'), VERSION, FORM)).toEqual({
      ok: false,
      reason: 'tag',
    });
  });

  it('keeps subsequent imported DNS actions when the entire selected scope is already matched', () => {
    const suffix = { domain_suffix: 'test', action: 'reject' };
    let text = setValue(
      TEXT,
      ['dns', 'rules'],
      [{ domain: ['alpha.test', 'beta.test', 'gamma.test'], server: 'group-dns' }, suffix]
    );
    text = setValue(text, ['dns', 'servers', 3], { ...SERVERS[1], tag: 'second' });
    const result = planDnsAssignment(text, VERSION, 'group', 'second');
    if (!result.ok) throw new Error(result.reason);
    expect(findValue(result.text, ['dns', 'rules', 1])).toEqual(suffix);
  });

  it('keeps empty, mismatched, unknown-core and unsupported ingress cases read-only', () => {
    expect(planDnsAssignment(TEXT, '1.14.4', 'direct', 'local')).toEqual({ ok: false, reason: 'core' });
    expect(planDnsAssignment(TEXT, VERSION, 'relay', 'group-dns')).toEqual({ ok: false, reason: 'resolver' });
    expect(planDnsAssignment(setValue(TEXT, ['dns', 'servers'], [SERVERS[0]]), VERSION, 'relay', 'local')).toEqual({
      ok: false,
      reason: 'resolver',
    });
    expect(planDnsAssignment(setValue(TEXT, ['inbounds'], []), VERSION, 'direct', 'local')).toEqual({
      ok: false,
      reason: 'scope',
    });
    expect(
      planDnsAssignment(
        TEXT.replace('"final": "group"', '"final":"relay", "final":"group"'),
        VERSION,
        'direct',
        'local'
      )
    ).toEqual({ ok: false, reason: 'draft' });
  });
});
