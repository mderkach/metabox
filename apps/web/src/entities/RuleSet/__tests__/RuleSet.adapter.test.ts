import { describe, expect, it } from 'vitest';

import { countRuleSetUsage, defaultFormatOf, describeURL, toRuleSetCatalog, toRuleSetRowsFromNodes } from '../model';
import { RULE_SET_CATALOG_FIXTURE } from './RuleSet.fixture';

const CATALOG = toRuleSetCatalog(RULE_SET_CATALOG_FIXTURE);

const GEOSITE_GOOGLE = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs';

describe('toRuleSetRowsFromNodes', () => {
  it('recognizes the provider, list kind and category in a catalog address', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'geosite-google', url: GEOSITE_GOOGLE }],
      new Map(),
      CATALOG
    );

    expect(row.source).toEqual({ providerId: 'v2fly', providerName: 'v2fly', kind: 'geosite', category: 'google' });
  });

  it('does not pass a foreign address off as a known source', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'own', url: 'https://example.com/own.srs' }],
      new Map(),
      CATALOG
    );

    expect(row.source.providerId).toBeNull();
    expect(row.source.category).toBeNull();
  });

  // A rule set without `type` is read by the core as remote, and the list must read it the same way:
  // otherwise the panel would show it as local and hide the address.
  it('reads a rule set without a type as remote', () => {
    const [row] = toRuleSetRowsFromNodes([{ tag: 'no-type', url: GEOSITE_GOOGLE }], new Map(), CATALOG);

    expect(row.type).toBe('remote');
    expect(row.location).toBe(GEOSITE_GOOGLE);
  });

  it('takes the node the rule set is downloaded through from both fields', () => {
    const rows = toRuleSetRowsFromNodes(
      [
        { type: 'remote', tag: 'a', url: GEOSITE_GOOGLE, download_detour: 'proxy' },
        { type: 'remote', tag: 'b', url: GEOSITE_GOOGLE, http_client: { detour: 'warp' } },
      ],
      new Map(),
      CATALOG
    );

    expect(rows[0].detour).toBe('proxy');
    expect(rows[1].detour).toBe('warp');
  });

  // The position is taken in the source array: an edit addresses the node in the file by it.
  it('does not shift node numbers because of a skipped non-object', () => {
    const rows = toRuleSetRowsFromNodes(
      ['мусор', { type: 'remote', tag: 'second', url: GEOSITE_GOOGLE }],
      new Map(),
      CATALOG
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].index).toBe(1);
  });

  it('shows how many rules refer to the rule set', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'geosite-google', url: GEOSITE_GOOGLE }],
      new Map([['geosite-google', 2]]),
      CATALOG
    );

    expect(row.usedBy).toBe(2);
  });
});

describe('countRuleSetUsage', () => {
  it('counts references as a string and as a list', () => {
    const usage = countRuleSetUsage([{ rule_set: 'a' }, { rule_set: ['a', 'b'] }]);

    expect(usage.get('a')).toBe(2);
    expect(usage.get('b')).toBe(1);
  });

  // A rule referring to a rule set from inside a logical group refers to it
  // no less than a direct one: otherwise the rule set would look unused.
  it('sees a reference in nested branches of a logical rule', () => {
    const usage = countRuleSetUsage([{ type: 'logical', mode: 'and', rules: [{ rule_set: 'nested' }] }]);

    expect(usage.get('nested')).toBe(1);
  });

  it('does not count one rule twice for a repeated tag', () => {
    const usage = countRuleSetUsage([{ rule_set: ['a', 'a'] }]);

    expect(usage.get('a')).toBe(1);
  });
});

describe('describeURL', () => {
  it('recognizes a mirror of the same provider', () => {
    const source = describeURL(CATALOG, 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-ru.srs');

    expect(source).toEqual({ providerId: 'v2fly', providerName: 'v2fly', kind: 'geoip', category: 'ru' });
  });
});

describe('defaultFormatOf', () => {
  it('derives the format from the extension and does not invent it without an extension', () => {
    expect(defaultFormatOf(GEOSITE_GOOGLE)).toBe('binary');
    expect(defaultFormatOf('https://example.com/list.json')).toBe('source');
    expect(defaultFormatOf('https://example.com/list?id=5')).toBe('');
  });
});

describe('toRuleSetCatalog', () => {
  it('converts the check mark to a date and skips a list of an unknown kind', () => {
    const catalog = toRuleSetCatalog({
      providers: [
        {
          id: 'p',
          name: 'P',
          lists: [
            { ...RULE_SET_CATALOG_FIXTURE.providers[0].lists[0], updated_at: 1_790_294_400 },
            { ...RULE_SET_CATALOG_FIXTURE.providers[0].lists[1], kind: 'geoasn' },
          ],
        },
      ],
    });

    expect(catalog.providers[0].lists).toHaveLength(1);
    expect(catalog.providers[0].lists[0].updatedAt?.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });

  it('a zero mark means the date is unknown', () => {
    const catalog = toRuleSetCatalog({
      providers: [
        { id: 'p', name: 'P', lists: [{ ...RULE_SET_CATALOG_FIXTURE.providers[0].lists[0], updated_at: 0 }] },
      ],
    });

    expect(catalog.providers[0].lists[0].updatedAt).toBeNull();
  });
});
