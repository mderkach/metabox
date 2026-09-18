import { describe, expect, it } from 'vitest';

import { countRuleSetUsage, defaultFormatOf, describeURL, toRuleSetRowsFromNodes } from '../model';

const GEOSITE_GOOGLE = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs';

describe('toRuleSetRowsFromNodes', () => {
  it('узнаёт поставщика и категорию в адресе из каталога', () => {
    const [row] = toRuleSetRowsFromNodes([{ type: 'remote', tag: 'geosite-google', url: GEOSITE_GOOGLE }], new Map());

    expect(row.source.providerId).toBe('sing-geosite');
    expect(row.source.category).toBe('google');
  });

  it('не выдаёт чужой адрес за известный источник', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'own', url: 'https://example.com/own.srs' }],
      new Map()
    );

    expect(row.source.providerId).toBeNull();
    expect(row.source.category).toBeNull();
  });

  // Набор без `type` ядро читает как удалённый, и список обязан читать так же:
  // иначе панель показала бы его локальным и спрятала адрес.
  it('читает набор без типа как удалённый', () => {
    const [row] = toRuleSetRowsFromNodes([{ tag: 'no-type', url: GEOSITE_GOOGLE }], new Map());

    expect(row.type).toBe('remote');
    expect(row.location).toBe(GEOSITE_GOOGLE);
  });

  it('берёт узел, через который качается набор, из обоих полей', () => {
    const rows = toRuleSetRowsFromNodes(
      [
        { type: 'remote', tag: 'a', url: GEOSITE_GOOGLE, download_detour: 'proxy' },
        { type: 'remote', tag: 'b', url: GEOSITE_GOOGLE, http_client: { detour: 'warp' } },
      ],
      new Map()
    );

    expect(rows[0].detour).toBe('proxy');
    expect(rows[1].detour).toBe('warp');
  });

  // Позиция берётся в исходном массиве: по ней правка адресует узел в файле.
  it('не сдвигает номера узлов из-за пропущенного не-объекта', () => {
    const rows = toRuleSetRowsFromNodes(['мусор', { type: 'remote', tag: 'second', url: GEOSITE_GOOGLE }], new Map());

    expect(rows).toHaveLength(1);
    expect(rows[0].index).toBe(1);
  });

  it('показывает, сколько правил ссылается на набор', () => {
    const [row] = toRuleSetRowsFromNodes(
      [{ type: 'remote', tag: 'geosite-google', url: GEOSITE_GOOGLE }],
      new Map([['geosite-google', 2]])
    );

    expect(row.usedBy).toBe(2);
  });
});

describe('countRuleSetUsage', () => {
  it('считает ссылки строкой и списком', () => {
    const usage = countRuleSetUsage([{ rule_set: 'a' }, { rule_set: ['a', 'b'] }]);

    expect(usage.get('a')).toBe(2);
    expect(usage.get('b')).toBe(1);
  });

  // Правило, сославшееся на набор изнутри логической группы, ссылается на него
  // не меньше прямого: иначе набор выглядел бы неиспользуемым.
  it('видит ссылку во вложенных ветках логического правила', () => {
    const usage = countRuleSetUsage([{ type: 'logical', mode: 'and', rules: [{ rule_set: 'nested' }] }]);

    expect(usage.get('nested')).toBe(1);
  });

  it('не считает одно правило дважды за повтор тега', () => {
    const usage = countRuleSetUsage([{ rule_set: ['a', 'a'] }]);

    expect(usage.get('a')).toBe(1);
  });
});

describe('describeURL', () => {
  it('узнаёт зеркало того же поставщика', () => {
    const source = describeURL('https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-ru.srs');

    expect(source).toEqual({ providerId: 'sing-geoip', category: 'ru' });
  });
});

describe('defaultFormatOf', () => {
  it('выводит формат из расширения и не выдумывает его без расширения', () => {
    expect(defaultFormatOf(GEOSITE_GOOGLE)).toBe('binary');
    expect(defaultFormatOf('https://example.com/list.json')).toBe('source');
    expect(defaultFormatOf('https://example.com/list?id=5')).toBe('');
  });
});
