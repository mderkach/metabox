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
  it('находит список поставщика по виду', () => {
    expect(findList(CATALOG, 'v2fly', 'geoip')?.categories).toContain('ru');
  });

  it('свой адрес и незнакомый вид — списка нет', () => {
    expect(findList(CATALOG, null, 'geosite')).toBeNull();
    expect(findList(CATALOG, 'v2fly', 'geoasn')).toBeNull();
  });
});

describe('filterCategories', () => {
  it('на пустом запросе отдаёт подборку, а не алфавит перечня', () => {
    const list = runetGeosite();

    expect(filterCategories(list, '  ')).toEqual(list.featured);
  });

  it('ищет по всему перечню и ставит совпавшие с начала первыми', () => {
    const found = filterCategories(runetGeosite(), 'ru-blocked');

    expect(found).toEqual(['ru-blocked', 'ru-blocked-all', 'category-media-ru-blocked']);
  });
});

describe('isCatalogCategory', () => {
  it('отличает категорию из перечня от вписанной руками', () => {
    const list = runetGeosite();

    expect(isCatalogCategory(list, 'yandex@ads')).toBe(true);
    expect(isCatalogCategory(list, 'mystuff')).toBe(false);
  });
});

describe('адрес и имя набора', () => {
  it('собирает адрес по зеркалу списка и предлагает имя файла', () => {
    const list = runetGeosite();

    expect(buildRuleSetURL(list, 'jsdelivr', 'ru-blocked')).toBe(
      'https://cdn.jsdelivr.net/gh/runetfreedom/russia-v2ray-rules-dat@release/sing-box/rule-set-geosite/geosite-ru-blocked.srs'
    );
    expect(suggestTag(list, 'ru-blocked')).toBe('geosite-ru-blocked');
  });

  it('узнаёт собранный адрес обратно', () => {
    const url = buildRuleSetURL(runetGeosite(), 'github', 'youtube');

    expect(describeURL(CATALOG, url)).toEqual({
      providerId: 'runetfreedom',
      providerName: 'Runet Freedom',
      kind: 'geosite',
      category: 'youtube',
    });
  });
});
