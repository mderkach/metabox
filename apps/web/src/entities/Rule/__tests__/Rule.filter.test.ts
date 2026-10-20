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

describe('rule search', () => {
  const rules = [makeRule()];

  it('an empty query lets everything through', () => {
    expect(filterRules(rules, '', null)).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    expect(filterRules(rules, 'GOOGLE', null)).toHaveLength(1);
  });

  it('requires all words to match', () => {
    expect(filterRules(rules, 'google fallback', null)).toHaveLength(1);
    expect(filterRules(rules, 'google direct', null)).toHaveLength(0);
  });
});

describe('rule outbounds', () => {
  it('counts rules and puts frequent ones first', () => {
    const rules = [
      makeRule({ id: '0', target: 'direct' }),
      makeRule({ id: '1', target: 'proxy' }),
      makeRule({ id: '2', target: 'proxy' }),
    ];

    expect(toTargetGroups(rules)).toEqual([
      { target: 'proxy', kind: RULE_TARGET.Outbound, count: 2 },
      { target: 'direct', kind: RULE_TARGET.Outbound, count: 1 },
    ]);
  });

  it('counts an action on a par with an outbound: for filtering it is the same kind of outbound', () => {
    const rules = [makeRule({ id: '0', target: 'sniff', targetKind: RULE_TARGET.Action }), makeRule({ id: '1' })];

    expect(toTargetGroups(rules).map(({ target, kind }) => [target, kind])).toEqual([
      ['sniff', RULE_TARGET.Action],
      ['us-west-fallback', RULE_TARGET.Outbound],
    ]);
  });
});

describe('rule filtering', () => {
  const rules = [
    makeRule({ id: '0', target: 'direct', searchText: 'clash_mode Direct direct' }),
    makeRule({ id: '1', target: 'proxy', searchText: 'rule_set github proxy' }),
  ];

  it('narrows by outbound', () => {
    expect(filterRules(rules, '', 'proxy').map((rule) => rule.id)).toEqual(['1']);
  });

  it('combines outbound and query', () => {
    expect(filterRules(rules, 'github', 'direct')).toEqual([]);
    expect(filterRules(rules, 'github', 'proxy').map((rule) => rule.id)).toEqual(['1']);
  });
});

describe('filter by rule set', () => {
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
    // A rule set tag in another condition is not a reference to a rule set.
    makeRule({ id: '2', matchers: [{ key: 'domain_suffix', values: ['geosite-ru'] }] }),
  ];

  it('takes rules that refer to the rule set, including from a nested branch', () => {
    expect(filterRules(rules, '', null, 'geosite-ru').map((rule) => rule.id)).toEqual(['0', '1']);
  });

  it('does not confuse a rule set with a substring match', () => {
    expect(filterRules(rules, '', null, 'geosite')).toEqual([]);
  });
});

describe('rule filter in the address', () => {
  it('accepts a rule number and a rule set', () => {
    expect(parseRuleSearch({ rule: '3', rule_set: 'geoip-ru' })).toEqual({ rule: 3, rule_set: 'geoip-ru' });
  });

  // The router parses a hand-typed `?rule_set=123` as a number: a tag of digits
  // stays a tag and does not drop the rule number along with it.
  it('a tag of digits is read as a string', () => {
    expect(parseRuleSearch({ rule: 3, rule_set: 123 })).toEqual({ rule: 3, rule_set: '123' });
  });

  it('an empty rule set discards the whole filter', () => {
    expect(parseRuleSearch({ rule: 3, rule_set: '' })).toEqual({});
  });
});
