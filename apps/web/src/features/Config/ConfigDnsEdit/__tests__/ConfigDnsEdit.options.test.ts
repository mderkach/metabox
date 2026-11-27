import { describe, expect, it } from 'vitest';

import { findValue } from '@entities/Config';

import { DNS_STRATEGIES, planDnsStrategy, planHostEntry, readDnsOptions } from '../model/ConfigDnsEdit.options';

const VERSION = '1.14.3-extended-2.7.3';
const HOSTS =
  '{"type":"hosts","tag":"static","path":["/etc/test.hosts"],"future_flag":true,"predefined":{"Printer.Test.":/* keep format */["192.0.2.1"], /* other */ "other.test":"2001:db8::1"}}';
const TEXT =
  '{"dns":{"strategy":"prefer_ipv6","servers":[{"type":"local","tag":"main"},' +
  HOSTS +
  '],"final":"main","rules":[{"domain":"printer.test","server":"static"}]}}';
const BASE = ['dns', 'servers', 1, 'predefined'];
function ok(plan: ReturnType<typeof planHostEntry>) {
  if (!plan.ok) throw new Error(plan.reason);
  return plan.text;
}

describe('default DNS address family', () => {
  it.each(DNS_STRATEGIES)('stages only the global strategy %s in a compact import', (strategy) => {
    expect(ok(planDnsStrategy(TEXT, VERSION, strategy))).toBe(TEXT.replace('"prefer_ipv6"', JSON.stringify(strategy)));
  });
  it.each(['{}', '{"dns":{}}', '{"dns":{"strategy":""}}', '{"dns":{"strategy":"as_is"}}'])(
    'leaves the equivalent default %s byte-for-byte intact',
    (input) => {
      expect(ok(planDnsStrategy(input, VERSION, 'as_is'))).toBe(input);
      expect(findValue(ok(planDnsStrategy(input, VERSION, 'ipv4_only')), ['dns', 'strategy'])).toBe('ipv4_only');
    }
  );
  it('shows an unsupported imported strategy and keeps independent hosts edits available', () => {
    const input = TEXT.replace('prefer_ipv6', 'future_mode');
    expect(readDnsOptions(input, VERSION)).toMatchObject({ strategy: 'future_mode', knownStrategy: false });
    expect(planDnsStrategy(input, VERSION, 'ipv4_only')).toEqual({ ok: false, reason: 'unknownStrategy' });
    expect(ok(planHostEntry(input, VERSION, 1, null, { domain: 'backup.test', addresses: '192.0.2.9' }))).toContain(
      '"strategy":"future_mode"'
    );
  });
});

describe('predefined entries on an existing hosts DNS server', () => {
  it('adds multiple addresses to the requested server and preserves all surrounding bytes', () => {
    const added = ok(
      planHostEntry(TEXT, VERSION, 1, null, { domain: 'office.test', addresses: '192.0.2.3, 2001:db8::2' })
    );
    const delta = ',"office.test": ["192.0.2.3","2001:db8::2"]';
    expect(added.replace(delta, '')).toBe(TEXT);
    expect(ok(planHostEntry(added, VERSION, 1, 'office.test', null))).toBe(TEXT);
  });
  it('renames the key in place and preserves the original address shape and comments', () => {
    expect(
      ok(planHostEntry(TEXT, VERSION, 1, 'Printer.Test.', { domain: 'Laser.Test.', addresses: '192.0.2.1' }))
    ).toBe(TEXT.replace('Printer.Test.', 'Laser.Test.'));
    expect(
      ok(planHostEntry(TEXT, VERSION, 1, 'Printer.Test.', { domain: 'Printer.Test.', addresses: '192.0.2.2' }))
    ).toBe(TEXT.replace('["192.0.2.1"]', '["192.0.2.2"]'));
    const removed = ok(planHostEntry(TEXT, VERSION, 1, 'Printer.Test.', null));
    expect(removed).toBe(TEXT.replace('"Printer.Test.":/* keep format */["192.0.2.1"],', ''));
  });
  it('edits the selected hosts transport with a missing map, preserving the default and its external path', () => {
    const input = '{"dns":{"servers":[' + HOSTS + ',{"type":"hosts","tag":"other","path":"/tmp/test.hosts"}]}}';
    const added = ok(planHostEntry(input, VERSION, 1, null, { domain: 'router.test', addresses: '192.0.2.4' }));
    expect(findValue(added, BASE)).toEqual({ 'router.test': '192.0.2.4' });
    expect(added).toContain(HOSTS);
  });
  it('recognizes canonical alias collisions in imported entries and during add/rename', () => {
    expect(planHostEntry(TEXT, VERSION, 1, 'other.test', { domain: 'printer.test', addresses: '192.0.2.8' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    expect(planHostEntry(TEXT.replace('"other.test"', '"printer.test"'), VERSION, 1, 'Printer.Test.', null)).toEqual({
      ok: false,
      reason: 'ambiguous',
    });
    expect(planHostEntry(TEXT, VERSION, 0, null, { domain: 'office.test', addresses: '192.0.2.1' }).ok).toBe(false);
  });
  it.each([
    ['192.0.2.1', '192.0.2.1'],
    ['-bad.test', '192.0.2.1'],
    ['host.test', '192.0.2.300'],
    ['host.test', '2001:::2'],
    ['host.test', ''],
    ['host.test', '192.0.2.8, bad'],
  ])('rejects invalid %s → %s', (domain, addresses) => {
    expect(planHostEntry(TEXT, VERSION, 1, null, { domain, addresses }).ok).toBe(false);
  });
  it.each(['null', '[]', '{"host.test":[42]}', '"other"'])(
    'leaves an unsupported hosts map %s read-only while allowing a strategy edit',
    (malformed) => {
      const input = '{"dns":{"servers":[{"type":"hosts","predefined":' + malformed + '}]}}';
      expect(readDnsOptions(input, VERSION).hosts[0].reason).toBe('malformedHosts');
      expect(planHostEntry(input, VERSION, 0, null, { domain: 'office.test', addresses: '192.0.2.1' }).ok).toBe(false);
      expect(ok(planDnsStrategy(input, VERSION, 'prefer_ipv4'))).toContain('"predefined":' + malformed);
    }
  );
  it('refuses duplicate JSONC keys and a core outside the verified pin', () => {
    expect(planDnsStrategy(TEXT, undefined, 'ipv6_only').ok).toBe(false);
    expect(planHostEntry(TEXT, 'other', 1, 'other.test', null).ok).toBe(false);
    expect(
      planHostEntry(TEXT.replace('"predefined":', '"predefined":{}, "predefined":'), VERSION, 1, 'other.test', null).ok
    ).toBe(false);
  });
  it('preserves standalone and trailing comments, trailing commas, and CRLF on insertion', () => {
    const input = '{\r\n  "dns": {\r\n    "servers": [], // keep\r\n  },\r\n}';
    expect(ok(planDnsStrategy(input, VERSION, 'prefer_ipv6'))).toBe(
      input.replace(' // keep\r\n', ' // keep\r\n    "strategy": "prefer_ipv6",\r\n')
    );
  });
  it.each(['', ','])('restores the original multiline map with trailing comma %j on removal', (trailing) => {
    const input = TEXT.replace(
      '"other.test":"2001:db8::1"}',
      '"other.test":"2001:db8::1"' + trailing + ' // keep\r\n    }'
    );
    const added = ok(planHostEntry(input, VERSION, 1, null, { domain: 'office.test', addresses: '192.0.2.2' }));
    expect(added).toContain('// keep\r\n');
    expect(ok(planHostEntry(added, VERSION, 1, 'office.test', null))).toBe(input);
  });
  it('keeps comments and unchanged address tokens through replacement, insertion and deletion inside a list', () => {
    const list = '[\n  /* first */ "192.0.2.1",\n  // last\n  "2001:db8::1"\n]';
    const input = TEXT.replace('["192.0.2.1"]', list);
    const edit = (source: string, addresses: string) =>
      ok(planHostEntry(source, VERSION, 1, 'Printer.Test.', { domain: 'Printer.Test.', addresses }));
    expect(edit(input, '192.0.2.3, 2001:db8::1')).toBe(input.replace('192.0.2.1', '192.0.2.3'));
    const added = edit(input, '192.0.2.1, 192.0.2.3, 2001:db8::1');
    expect(added).toContain('/* first */ "192.0.2.1"');
    expect(added).toContain('// last\n  "2001:db8::1"');
    expect(edit(added, '192.0.2.1, 2001:db8::1')).toBe(input);
  });
});
