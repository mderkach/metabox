import { describe, expect, it } from 'vitest';

import { collectRuleSetUsage, toRuleSetCatalog, toRuleSetRowsFromNodes } from '../model/RuleSet.adapter';
import { describeURL } from '../model/RuleSet.catalog';
import { defaultFormatOf } from '../model/RuleSet.model';
import type { RuleSetFileStat } from '../model/RuleSet.model';
import { RULE_SET_CATALOG_FIXTURE } from './RuleSet.fixture';

const CATALOG = toRuleSetCatalog(RULE_SET_CATALOG_FIXTURE);
const NO_FILES = new Map<string, RuleSetFileStat>();

const GEOSITE_GOOGLE = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs';

describe('toRuleSetRowsFromNodes', () => {
  it('recognizes the provider, list kind and category in a catalog address', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'geosite-google', url: GEOSITE_GOOGLE }],
      new Map(),
      CATALOG,
      NO_FILES
    );

    expect(row.source).toEqual({ providerId: 'v2fly', providerName: 'v2fly', kind: 'geosite', category: 'google' });
  });

  it('does not pass a foreign address off as a known source', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'own', url: 'https://example.com:8443/sets/own.srs?auth=example#latest' }],
      new Map(),
      CATALOG,
      NO_FILES
    );

    expect(row.source.providerId).toBeNull();
    expect(row.source.category).toBeNull();
    expect(row.description).toEqual({ kind: 'remote', host: 'example.com:8443', fileName: 'own.srs' });
  });

  it.each(['google', 'ru', 'category-ads-all', 'ru-blocked', 'geolocation-!cn'])(
    'preserves the published category %s in both list kinds',
    (category) => {
      const [provider] = CATALOG.providers;
      const rows = toRuleSetRowsFromNodes(
        provider.lists.map(({ prefix, mirrors }) => ({
          type: 'remote',
          tag: `${prefix}${category}`,
          url: `${mirrors[0].base}${prefix}${category}.srs`,
        })),
        new Map(),
        CATALOG,
        NO_FILES
      );

      expect(rows.map((row) => row.description)).toEqual([
        {
          kind: 'geosite',
          providerName: provider.name,
          category,
          fileName: `geosite-${category}.srs`,
          mirrorHost: null,
        },
        { kind: 'geoip', providerName: provider.name, category, fileName: `geoip-${category}.srs`, mirrorHost: null },
      ]);
    }
  );

  it('describes a catalog mirror by host even with a query string', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'ru', url: 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-ru.srs?v=1' }],
      new Map(),
      CATALOG,
      NO_FILES
    );

    expect(row.description).toEqual({
      kind: 'geoip',
      providerName: 'v2fly',
      category: 'ru',
      fileName: 'geoip-ru.srs',
      mirrorHost: 'cdn.jsdelivr.net',
    });
  });

  it('describes local and inline rules by their source without exposing entries', () => {
    const rows = toRuleSetRowsFromNodes(
      [
        { type: 'local', tag: 'own', path: 'rule-sets/own.json' },
        { type: 'inline', tag: 'inline', rules: [{ domain: ['example.com'] }] },
        { type: 'remote', tag: 'invalid', url: 'incomplete-address' },
      ],
      new Map(),
      CATALOG,
      NO_FILES
    );

    expect(rows.map((row) => row.description)).toEqual([
      { kind: 'local', path: 'rule-sets/own.json' },
      { kind: 'inline' },
      { kind: 'remote', host: null, fileName: null },
    ]);
  });

  // A rule set without `type` is read by the core as remote, and the list must read it the same way:
  // otherwise the panel would show it as local and hide the address.
  it('reads a rule set without a type as remote', () => {
    const [row] = toRuleSetRowsFromNodes([{ tag: 'no-type', url: GEOSITE_GOOGLE }], new Map(), CATALOG, NO_FILES);

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
      CATALOG,
      NO_FILES
    );

    expect(rows[0].detour).toBe('proxy');
    expect(rows[1].detour).toBe('warp');
  });

  // The position is taken in the source array: an edit addresses the node in the file by it.
  it('does not shift node numbers because of a skipped non-object', () => {
    const rows = toRuleSetRowsFromNodes(
      ['мусор', { type: 'remote', tag: 'second', url: GEOSITE_GOOGLE }],
      new Map(),
      CATALOG,
      NO_FILES
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].index).toBe(1);
  });

  it('uses route and DNS references for both the usage list and count', () => {
    const usage = collectRuleSetUsage([
      { kind: 'route', rules: [{}, { rule_set: 'geosite-google' }], names: [null, 'Through VPN'] },
      { kind: 'dns', rules: [{ rule_set: 'geosite-google' }], names: [] },
    ]);
    const [used, unused] = toRuleSetRowsFromNodes(
      [
        { type: 'remote', tag: 'geosite-google', url: GEOSITE_GOOGLE },
        { type: 'inline', tag: 'unused' },
      ],
      usage,
      CATALOG,
      NO_FILES
    );

    expect(used.usage).toEqual([
      { kind: 'route', number: 2, name: 'Through VPN' },
      { kind: 'dns', number: 1, name: null },
    ]);
    expect(used.usedBy).toBe(2);
    expect(unused.usage).toEqual([]);
    expect(unused.usedBy).toBe(0);
  });

  // Only the daemon's own list files are visible on disk: a remote set and a path outside
  // `rule-sets/` stay unknown even when a file of the same name is there.
  it('takes the file stat only for an own list file', () => {
    const stat: RuleSetFileStat = { size: 512, modifiedAt: 1_700_000_000_000 };
    const files = new Map([['home.json', stat]]);

    const rows = toRuleSetRowsFromNodes(
      [
        { type: 'local', tag: 'home', format: 'source', path: 'rule-sets/home.json' },
        { type: 'local', tag: 'foreign', format: 'source', path: '/etc/home.json' },
        { type: 'local', tag: 'draft', format: 'source', path: 'rule-sets/draft.json' },
        { type: 'remote', tag: 'remote', url: GEOSITE_GOOGLE },
      ],
      new Map(),
      CATALOG,
      files
    );

    expect(rows.map((row) => row.file)).toEqual([stat, null, null, null]);
  });
});

describe('collectRuleSetUsage', () => {
  it('groups repeated references in nested branches under their parent DNS rule', () => {
    const usage = collectRuleSetUsage([
      {
        kind: 'dns',
        rules: [
          null,
          {
            type: 'logical',
            mode: 'and',
            rules: [
              { rule_set: ['a', 'a'] },
              { type: 'logical', mode: 'or', rules: [{ rule_set: 'a' }, { rule_set: 'b' }] },
            ],
          },
        ],
        names: [null, 'Internal DNS'],
      },
    ]);

    expect(usage.get('a')).toEqual([{ kind: 'dns', number: 2, name: 'Internal DNS' }]);
    expect(usage.get('b')).toEqual([{ kind: 'dns', number: 2, name: 'Internal DNS' }]);
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
