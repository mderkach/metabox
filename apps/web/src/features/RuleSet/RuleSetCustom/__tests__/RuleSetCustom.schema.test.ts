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
  it('раскладывает домены и адреса по своим условиям', () => {
    const { rules, invalid } = parseListEntries('example.com\n203.0.113.0/24\n198.51.100.7\n2001:db8::/32');

    expect(invalid).toBeNull();
    expect(rules.domainSuffixes).toEqual(['example.com']);
    expect(rules.cidrs).toEqual(['203.0.113.0/24', '198.51.100.7', '2001:db8::/32']);
  });

  it('пропускает пустые строки и комментарии', () => {
    const { rules, invalid } = parseListEntries('\n# список\n  example.org  \n\n');

    expect(invalid).toBeNull();
    expect(rules.domainSuffixes).toEqual(['example.org']);
  });

  it('называет первую непонятую строку', () => {
    expect(parseListEntries('example.com\nне домен\nexample.org').invalid).toBe('не домен');
  });
});

describe('makeRuleSetCustomSchema', () => {
  const schema = makeRuleSetCustomSchema(['taken']);

  it('принимает свежее имя и разобранный список', () => {
    expect(schema.safeParse({ tag: 'my-list', storage: 'inline', entries: 'example.com' }).success).toBe(true);
  });

  it.each([
    ['пустое имя', { tag: '  ', storage: 'inline', entries: 'example.com' }, RULE_SET_CUSTOM_ERROR.TagRequired],
    ['занятое имя', { tag: 'taken', storage: 'inline', entries: 'example.com' }, RULE_SET_CUSTOM_ERROR.TagTaken],
    [
      'пустой список',
      { tag: 'ok', storage: 'inline', entries: '# только комментарий' },
      RULE_SET_CUSTOM_ERROR.EntriesRequired,
    ],
    ['непонятая строка', { tag: 'ok', storage: 'inline', entries: 'so wrong' }, RULE_SET_CUSTOM_ERROR.EntryInvalid],
  ])('отклоняет %s', (_name, value, code) => {
    const parsed = schema.safeParse(value);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(code);
  });
});

describe('toInlineRuleSet', () => {
  it('собирает узел inline без пустых условий', () => {
    expect(toInlineRuleSet({ tag: ' my-list ', storage: 'inline', entries: 'example.com\nexample.org' })).toEqual({
      type: 'inline',
      tag: 'my-list',
      rules: [{ domain_suffix: ['example.com', 'example.org'] }],
    });
  });

  it('кладёт адреса в ip_cidr', () => {
    expect(toInlineRuleSet({ tag: 'ips', storage: 'inline', entries: '203.0.113.0/24' })).toEqual({
      type: 'inline',
      tag: 'ips',
      rules: [{ ip_cidr: ['203.0.113.0/24'] }],
    });
  });
});

describe('список файлом', () => {
  const model = { tag: 'my-list', storage: 'file', entries: 'example.com' } as const;

  it('имя файла с недопустимыми символами отклоняется только в режиме файла', () => {
    const schema = makeRuleSetCustomSchema([]);
    const withColon = { ...model, tag: 'мой список' };

    expect(schema.safeParse(withColon).success).toBe(false);
    expect(schema.safeParse({ ...withColon, storage: 'inline' }).success).toBe(true);
  });

  it('узел local ссылается на файл в подкаталоге rule-sets', () => {
    expect(toLocalRuleSet(model)).toEqual({
      type: 'local',
      tag: 'my-list',
      format: 'source',
      path: 'rule-sets/my-list.json',
    });
  });

  it('файл собирается в формате source первой версии', () => {
    expect(JSON.parse(toListFileContent(model))).toEqual({
      version: 1,
      rules: [{ domain_suffix: ['example.com'] }],
    });
  });
});
