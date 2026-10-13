import { describe, expect, it } from 'vitest';

import {
  buildRuleSetURL,
  describeURL,
  filterCategories,
  findList,
  isCatalogCategory,
  suggestTag,
  toRuleSetCatalog,
  type RuleSetList,
} from '../model';
import { RULE_SET_CATALOG_FIXTURE } from './RuleSet.fixture';

const CATALOG = toRuleSetCatalog(RULE_SET_CATALOG_FIXTURE);

function runetGeosite(): RuleSetList {
  const list = findList(CATALOG, 'runetfreedom', 'geosite');

  if (list === null) {
    throw new Error('в фикстуре нет списка сайтов Runet Freedom');
  }

  return list;
}

describe('findList', () => {
  it('finds a provider list by kind', () => {
    expect(findList(CATALOG, 'v2fly', 'geoip')?.categories).toContain('ru');
  });

  it('own address and unknown kind: no list', () => {
    expect(findList(CATALOG, null, 'geosite')).toBeNull();
    expect(findList(CATALOG, 'v2fly', 'geoasn')).toBeNull();
  });
});

describe('filterCategories', () => {
  it('on an empty query returns a selection, not the catalog alphabet', () => {
    const list = runetGeosite();

    expect(filterCategories(list, '  ')).toEqual(list.featured);
  });

  it('searches the whole catalog and puts matches from the start first', () => {
    const found = filterCategories(runetGeosite(), 'ru-blocked');

    expect(found).toEqual(['ru-blocked', 'ru-blocked-all', 'category-media-ru-blocked']);
  });
});

describe('isCatalogCategory', () => {
  it('tells a catalog category from a hand-typed one', () => {
    const list = runetGeosite();

    expect(isCatalogCategory(list, 'yandex@ads')).toBe(true);
    expect(isCatalogCategory(list, 'mystuff')).toBe(false);
  });
});

describe('rule set address and name', () => {
  it('builds an address from the list mirror and suggests a file name', () => {
    const list = runetGeosite();

    expect(buildRuleSetURL(list, 'jsdelivr', 'ru-blocked')).toBe(
      'https://cdn.jsdelivr.net/gh/runetfreedom/russia-v2ray-rules-dat@release/sing-box/rule-set-geosite/geosite-ru-blocked.srs'
    );
    expect(suggestTag(list, 'ru-blocked')).toBe('geosite-ru-blocked');
  });

  it('recognizes a built address back', () => {
    const url = buildRuleSetURL(runetGeosite(), 'github', 'youtube');

    expect(describeURL(CATALOG, url)).toEqual({
      providerId: 'runetfreedom',
      providerName: 'Runet Freedom',
      kind: 'geosite',
      category: 'youtube',
    });
  });
});
