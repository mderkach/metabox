import { describe, expect, it } from 'vitest';

import { filterRules, parseRuleSearch, toTargetGroups } from '../model/Rule.filter';
import { RULE_TARGET } from '../model/Rule.model';
import type { RuleRow } from '../model/Rule.model';

function makeRule(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id: '0',
    index: 1,
    matchers: [{ key: 'rule_set', values: ['google-ip'] }],
    group: null,
    invert: false,
    target: 'us-west-fallback',
    targetKind: RULE_TARGET.Outbound,
    targetDetail: null,
    isCatchAll: false,
    recognized: true,
    searchText: 'rule_set google-ip us-west-fallback',
    ...overrides,
  };
}

describe('поиск по правилу', () => {
  const rules = [makeRule()];

  it('пустой запрос пропускает всё', () => {
    expect(filterRules(rules, '', null)).toHaveLength(1);
  });

  it('не различает регистр', () => {
    expect(filterRules(rules, 'GOOGLE', null)).toHaveLength(1);
  });

  it('требует совпадения всех слов', () => {
    expect(filterRules(rules, 'google fallback', null)).toHaveLength(1);
    expect(filterRules(rules, 'google direct', null)).toHaveLength(0);
  });
});

describe('выходы правил', () => {
  it('считает правила и ставит частые первыми', () => {
    const rules = [
      makeRule({ id: '0', target: 'direct' }),
      makeRule({ id: '1', target: 'proxy' }),
      makeRule({ id: '2', target: 'proxy' }),
    ];

    expect(toTargetGroups(rules)).toEqual([
      { target: 'proxy', count: 2 },
      { target: 'direct', count: 1 },
    ]);
  });

  it('действие считает наравне с аутбаундом: для отбора это такой же выход', () => {
    const rules = [makeRule({ id: '0', target: 'sniff', targetKind: RULE_TARGET.Action }), makeRule({ id: '1' })];

    expect(toTargetGroups(rules).map((group) => group.target)).toEqual(['sniff', 'us-west-fallback']);
  });
});

describe('отбор правил', () => {
  const rules = [
    makeRule({ id: '0', target: 'direct', searchText: 'clash_mode Direct direct' }),
    makeRule({ id: '1', target: 'proxy', searchText: 'rule_set github proxy' }),
  ];

  it('сужает по выходу', () => {
    expect(filterRules(rules, '', 'proxy').map((rule) => rule.id)).toEqual(['1']);
  });

  it('складывает выход и запрос', () => {
    expect(filterRules(rules, 'github', 'direct')).toEqual([]);
    expect(filterRules(rules, 'github', 'proxy').map((rule) => rule.id)).toEqual(['1']);
  });
});

describe('отбор по сету', () => {
  const rules = [
    makeRule({ id: '0', matchers: [{ key: 'rule_set', values: ['geoip-ru', 'geosite-ru'] }] }),
    makeRule({
      id: '1',
      matchers: [],
      group: {
        mode: 'and',
        invert: false,
        children: [
          { matchers: [{ key: 'network', values: ['udp'] }], group: null },
          { matchers: [{ key: 'rule_set', values: ['geosite-ru'] }], group: null },
        ],
      },
    }),
    // Тег сета в другом условии — не ссылка на сет.
    makeRule({ id: '2', matchers: [{ key: 'domain_suffix', values: ['geosite-ru'] }] }),
  ];

  it('берёт правила, которые ссылаются на сет, в том числе из вложенной ветки', () => {
    expect(filterRules(rules, '', null, 'geosite-ru').map((rule) => rule.id)).toEqual(['0', '1']);
  });

  it('не путает сет с совпадением по подстроке', () => {
    expect(filterRules(rules, '', null, 'geosite')).toEqual([]);
  });
});

describe('отбор правил в адресе', () => {
  it('принимает номер правила и сет', () => {
    expect(parseRuleSearch({ rule: '3', rule_set: 'geoip-ru' })).toEqual({ rule: 3, rule_set: 'geoip-ru' });
  });

  // Роутер разбирает `?rule_set=123`, набранный руками, как число: тег из цифр
  // остаётся тегом, а не роняет вместе с собой номер правила.
  it('тег из цифр читается строкой', () => {
    expect(parseRuleSearch({ rule: 3, rule_set: 123 })).toEqual({ rule: 3, rule_set: '123' });
  });

  it('пустой сет отбрасывает отбор целиком', () => {
    expect(parseRuleSearch({ rule: 3, rule_set: '' })).toEqual({});
  });
});
