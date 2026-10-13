import { describe, expect, it } from 'vitest';

import {
  RULE_SET_CUSTOM_ERROR,
  makeRuleSetCustomSchema,
  parseListEntries,
  toInlineRuleSet,
  toListFileContent,
  toLocalRuleSet,
} from '../model/RuleSetCustom.schema';

describe('parseListEntries', () => {
  it('splits domains and addresses into their own conditions', () => {
    const { rules, invalid } = parseListEntries('example.com\n203.0.113.0/24\n198.51.100.7\n2001:db8::/32');

    expect(invalid).toBeNull();
    expect(rules.domainSuffixes).toEqual(['example.com']);
    expect(rules.cidrs).toEqual(['203.0.113.0/24', '198.51.100.7', '2001:db8::/32']);
  });

  it('skips empty lines and comments', () => {
    const { rules, invalid } = parseListEntries('\n# список\n  example.org  \n\n');

    expect(invalid).toBeNull();
    expect(rules.domainSuffixes).toEqual(['example.org']);
  });

  it('names the first unrecognized line', () => {
    expect(parseListEntries('example.com\nне домен\nexample.org').invalid).toBe('не домен');
  });
});

describe('makeRuleSetCustomSchema', () => {
  const schema = makeRuleSetCustomSchema(['taken']);

  it('accepts a fresh name and a parsed list', () => {
    expect(schema.safeParse({ tag: 'my-list', storage: 'inline', entries: 'example.com' }).success).toBe(true);
  });

  it.each([
    ['empty name', { tag: '  ', storage: 'inline', entries: 'example.com' }, RULE_SET_CUSTOM_ERROR.TagRequired],
    ['taken name', { tag: 'taken', storage: 'inline', entries: 'example.com' }, RULE_SET_CUSTOM_ERROR.TagTaken],
    [
      'empty list',
      { tag: 'ok', storage: 'inline', entries: '# только комментарий' },
      RULE_SET_CUSTOM_ERROR.EntriesRequired,
    ],
    ['unrecognized line', { tag: 'ok', storage: 'inline', entries: 'so wrong' }, RULE_SET_CUSTOM_ERROR.EntryInvalid],
  ])('rejects %s', (_name, value, code) => {
    const parsed = schema.safeParse(value);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(code);
  });
});

describe('toInlineRuleSet', () => {
  it('builds an inline node without empty conditions', () => {
    expect(toInlineRuleSet({ tag: ' my-list ', storage: 'inline', entries: 'example.com\nexample.org' })).toEqual({
      type: 'inline',
      tag: 'my-list',
      rules: [{ domain_suffix: ['example.com', 'example.org'] }],
    });
  });

  it('puts addresses into ip_cidr', () => {
    expect(toInlineRuleSet({ tag: 'ips', storage: 'inline', entries: '203.0.113.0/24' })).toEqual({
      type: 'inline',
      tag: 'ips',
      rules: [{ ip_cidr: ['203.0.113.0/24'] }],
    });
  });
});

describe('list as a file', () => {
  const model = { tag: 'my-list', storage: 'file', entries: 'example.com' } as const;

  it('a file name with invalid characters is rejected only in file mode', () => {
    const schema = makeRuleSetCustomSchema([]);
    const withColon = { ...model, tag: 'мой список' };

    expect(schema.safeParse(withColon).success).toBe(false);
    expect(schema.safeParse({ ...withColon, storage: 'inline' }).success).toBe(true);
  });

  it('a local node refers to a file in the rule-sets subdirectory', () => {
    expect(toLocalRuleSet(model)).toEqual({
      type: 'local',
      tag: 'my-list',
      format: 'source',
      path: 'rule-sets/my-list.json',
    });
  });

  it('the file is built in source format version one', () => {
    expect(JSON.parse(toListFileContent(model))).toEqual({
      version: 1,
      rules: [{ domain_suffix: ['example.com'] }],
    });
  });
});
