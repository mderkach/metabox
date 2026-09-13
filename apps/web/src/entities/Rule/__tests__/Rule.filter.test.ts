import { describe, expect, it } from 'vitest';

import { filterRules, toTargetGroups } from '../model/Rule.filter';
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

describe('исходы правил', () => {
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

  it('действие считает наравне с аутбаундом: для отбора это такой же исход', () => {
    const rules = [makeRule({ id: '0', target: 'sniff', targetKind: RULE_TARGET.Action }), makeRule({ id: '1' })];

    expect(toTargetGroups(rules).map((group) => group.target)).toEqual(['us-west-fallback', 'sniff']);
  });
});

describe('отбор правил', () => {
  const rules = [
    makeRule({ id: '0', target: 'direct', searchText: 'clash_mode Direct direct' }),
    makeRule({ id: '1', target: 'proxy', searchText: 'rule_set github proxy' }),
  ];

  it('сужает по исходу', () => {
    expect(filterRules(rules, '', 'proxy').map((rule) => rule.id)).toEqual(['1']);
  });

  it('складывает исход и запрос', () => {
    expect(filterRules(rules, 'github', 'direct')).toEqual([]);
    expect(filterRules(rules, 'github', 'proxy').map((rule) => rule.id)).toEqual(['1']);
  });
});
