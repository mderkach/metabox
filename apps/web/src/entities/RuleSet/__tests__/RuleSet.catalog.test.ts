import { describe, expect, it } from 'vitest';

import { describeURL, filterCategories, findProvider, isCatalogCategory, RULE_SET_PROVIDERS } from '../model';

const RUNET_GEOSITE = 'runetfreedom-geosite';

function runetGeosite() {
  const provider = findProvider(RUNET_GEOSITE);

  if (provider === null) {
    throw new Error('в каталоге нет Runet Freedom');
  }

  return provider;
}

describe('каталог поставщиков', () => {
  it.each(RULE_SET_PROVIDERS.map((provider) => [provider.id, provider] as const))(
    'подборка %s целиком есть в снимке: иначе подсказка ведёт на несуществующий файл',
    (_, provider) => {
      expect(provider.featured.filter((category) => !isCatalogCategory(provider, category))).toEqual([]);
    }
  );

  it('открывает форму на Runet Freedom', () => {
    expect(RULE_SET_PROVIDERS[0].id).toBe(RUNET_GEOSITE);
  });
});

describe('filterCategories', () => {
  it('на пустом запросе отдаёт подборку, а не алфавит снимка', () => {
    const provider = runetGeosite();

    expect(filterCategories(provider, '  ')).toEqual(provider.featured);
  });

  it('ищет по всему снимку и ставит совпавшие с начала первыми', () => {
    const found = filterCategories(runetGeosite(), 'ru-blocked');

    expect(found[0]).toBe('ru-blocked');
    expect(found).toContain('category-media-ru-blocked');
    expect(found.indexOf('ru-blocked-all')).toBeLessThan(found.indexOf('category-media-ru-blocked'));
  });
});

describe('describeURL', () => {
  it('узнаёт Runet Freedom по зеркалу jsDelivr', () => {
    const source = describeURL(
      'https://cdn.jsdelivr.net/gh/runetfreedom/russia-v2ray-rules-dat@release/sing-box/rule-set-geoip/geoip-ru-blocked.srs'
    );

    expect(source).toEqual({ providerId: 'runetfreedom-geoip', category: 'ru-blocked' });
  });
});
