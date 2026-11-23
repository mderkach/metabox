import { describe, expect, it } from 'vitest';

import { readRules } from '@entities/Config';

import { simpleAddress, simpleRuleRelation } from '../model/SimpleRoutes.conditions';
import { planCustomRule } from '../model/SimpleRoutes.custom';

const OUTBOUNDS = [
  { type: 'direct', tag: 'home' },
  { type: 'socks', tag: 'away', server: '192.0.2.11', server_port: 1080 },
];
const DEVICE = '192.0.2.1';
const FORM = { address: 'TV.Example.Org.', device: DEVICE, outbound: 'away' };
const GENERAL = { domain_suffix: 'example.org', outbound: 'home' };
const SET = { rule_set: 'video', outbound: 'home' };
const IMPORT = { type: 'logical', mode: 'or', rules: [{ domain_keyword: 'work' }], outbound: 'home' };

function draft(rules: unknown[]) {
  return JSON.stringify(
    {
      outbounds: OUTBOUNDS,
      route: { rules, rule_set: [{ tag: 'video', type: 'inline', rules: [{ domain: 'tv.example.org' }] }] },
      dns: { final: 'initial', rules: [{ rule_set: 'video', server: 'initial' }] },
    },
    null,
    2
  );
}

describe('custom route planning', () => {
  it('inserts a device exception before the general service and retains its JSONC name and DNS rule', () => {
    const original = draft([SET, IMPORT]).replace(
      '      {\n        "rule_set"',
      '      // Named service\n      {\n        "rule_set"'
    );
    const plan = planCustomRule(original, FORM, 0);
    expect(plan).toMatchObject({ ok: true, position: 1, before: true });
    if (!plan.ok) throw Error(plan.reason);
    expect(readRules(plan.text)).toEqual([
      { rule_set: ['video'], action: 'route', outbound: 'away', source_ip_cidr: [DEVICE] },
      SET,
      IMPORT,
    ]);
    expect(plan.text).toContain('// Named service\n      {\n        "rule_set"');
    expect(plan.text.split('"dns":')[1]).toBe(original.split('"dns":')[1]);
  });

  it('normalizes an exact domain and inserts it ahead of its matching suffix', () => {
    const unrelated = { domain: 'other.test', outbound: 'home' };
    const plan = planCustomRule(draft([unrelated, GENERAL]), FORM);
    expect(plan).toMatchObject({ ok: true, position: 2, before: true });
    if (!plan.ok) throw Error(plan.reason);
    expect(readRules(plan.text)[1]).toEqual({ domain: ['tv.example.org'], action: 'route', outbound: 'away' });
  });

  it.each([
    IMPORT,
    SET,
    { inbound: ['proxy'], action: 'hijack-dns' },
    { protocol: 'dns', action: 'hijack-dns', invert: true },
  ])('refuses an earlier rule whose overlap is unknown', (rule) => {
    expect(planCustomRule(draft([rule, GENERAL]), FORM, 1)).toEqual({ ok: false, reason: 'unknown', position: 1 });
  });

  it('leaves service steps ahead and inserts a literal IP before a covering IPv4 prefix', () => {
    const plan = planCustomRule(
      draft([
        { action: 'sniff' },
        { action: 'hijack-dns', protocol: 'dns' },
        { ip_cidr: '192.0.2.0/24', outbound: 'home' },
      ]),
      { ...FORM, address: DEVICE }
    );
    expect(plan).toMatchObject({ ok: true, position: 3, before: true });
    if (!plan.ok) throw Error(plan.reason);
    expect(readRules(plan.text)[2]).toEqual({ ip_cidr: [DEVICE], action: 'route', outbound: 'away' });
  });

  it('refuses duplicate section keys, ambiguous exits and a repeated device exception', () => {
    const duplicate = draft([GENERAL]).replace('"route":', '"route": {}, "route":');
    expect(planCustomRule(duplicate, FORM)).toMatchObject({ ok: false, reason: 'draft' });
    const ambiguous = draft([]).replace('"tag": "home"', '"tag": "away"');
    expect(planCustomRule(ambiguous, FORM)).toMatchObject({ ok: false, reason: 'exit' });
    const existing = { ...GENERAL, source_ip_cidr: DEVICE };
    expect(planCustomRule(draft([existing, GENERAL]), FORM, 1)).toMatchObject({
      ok: false,
      reason: 'duplicate',
      position: 1,
    });
  });

  it.each([
    'https://example.org',
    'example.org..',
    '192.168.999.3',
    'example.org/path',
    '192.0.2.1/28',
    '*.example.org',
  ])('refuses %s as a single domain or literal IP address', (address) => {
    expect(simpleAddress(address)).toBeNull();
  });

  it('distinguishes opaque set membership, broader domains, disjoint devices and equivalent IPv6 literals', () => {
    expect(simpleRuleRelation(SET, GENERAL)).toBe('unknown');
    expect(simpleRuleRelation(GENERAL, { domain: 'www.example.org', outbound: 'away' })).toBe('covers');
    expect(simpleRuleRelation(GENERAL, { domain: 'notexample.org', outbound: 'away' })).toBe('disjoint');
    expect(simpleRuleRelation({ ...SET, source_ip_cidr: DEVICE }, { ...SET, source_ip_cidr: '192.0.2.2' })).toBe(
      'disjoint'
    );
    expect(
      simpleRuleRelation({ ip_cidr: '2001:db8:0::1', outbound: 'away' }, { ip_cidr: '2001:db8::1', outbound: 'home' })
    ).toBe('covers');
  });
});
