import { describe, expect, it } from 'vitest';

import type { Config } from '@shared/api/generated';

import { checkRuleNode, isRuleRecognized, toRuleRows, toRuleRowsFromNodes } from '../model/Rule.adapter';
import { RULE_TARGET } from '../model/Rule.model';

function configWithRules(rules: object[]): Config {
  return { route: { rules } };
}

describe('toRuleRows', () => {
  it('returns an empty list when there are no rules', () => {
    expect(toRuleRows(null)).toEqual([]);
    expect(toRuleRows({})).toEqual([]);
  });

  it('numbers rules from one and keeps the config order', () => {
    const rows = toRuleRows(
      configWithRules([
        { rule_set: ['openai'], outbound: 'proxy' },
        { rule_set: ['github'], outbound: 'direct' },
      ])
    );

    expect(rows.map((row) => row.index)).toEqual([1, 2]);
    expect(rows.map((row) => row.target)).toEqual(['proxy', 'direct']);
  });

  it('builds conditions from schema fields and brings values to a list', () => {
    const [row] = toRuleRows(configWithRules([{ port: 53, domain_suffix: ['rt.ru', 'usmall.ru'] }]));

    expect(row.matchers).toContainEqual({ key: 'port', values: ['53'] });
    expect(row.matchers).toContainEqual({
      key: 'domain_suffix',
      values: ['rt.ru', 'usmall.ru'],
    });
  });

  it('orders conditions by schema, not by key order in the file', () => {
    const direct = toRuleRows(configWithRules([{ domain_suffix: ['rt.ru'], port: 53 }]));
    const reversed = toRuleRows(configWithRules([{ port: 53, domain_suffix: ['rt.ru'] }]));

    expect(direct[0].matchers).toEqual(reversed[0].matchers);
  });

  it('tells outbound and action apart', () => {
    const rows = toRuleRows(
      configWithRules([
        { inbound: ['dns-in'], action: 'hijack-dns' },
        { rule_set: ['apple'], outbound: 'proxy' },
      ])
    );

    expect(rows[0].targetKind).toBe(RULE_TARGET.Action);
    expect(rows[0].target).toBe('hijack-dns');
    expect(rows[1].targetKind).toBe(RULE_TARGET.Outbound);
  });

  it('treats route as the default action when none is given', () => {
    const [row] = toRuleRows(configWithRules([{ domain: ['example.com'] }]));

    expect(row.target).toBe('route');
    expect(row.targetKind).toBe(RULE_TARGET.Action);
  });

  it('marks a rule without conditions: it catches all the remaining traffic', () => {
    const [row] = toRuleRows(configWithRules([{ outbound: 'direct' }]));

    expect(row.isCatchAll).toBe(true);
    expect(row.matchers).toEqual([]);
  });

  it('does not count the service field type as a condition', () => {
    const [row] = toRuleRows(configWithRules([{ type: 'default', outbound: 'direct' }]));

    expect(row.matchers).toEqual([]);
  });

  it('folds conditions and the target into a search string', () => {
    const [row] = toRuleRows(configWithRules([{ domain_suffix: ['rt.ru'], outbound: 'direct' }]));

    expect(row.searchText).toBe('domain_suffix rt.ru direct');
  });
});

describe('logical rules', () => {
  it('does not count a logical rule as unconditional', () => {
    const [row] = toRuleRows(
      configWithRules([
        {
          type: 'logical',
          mode: 'or',
          rules: [{ port: 853 }, { network: 'udp', port: 443 }],
          action: 'reject',
        },
      ])
    );

    expect(row.isCatchAll).toBe(false);
    expect(row.group?.mode).toBe('or');
    expect(row.group?.children).toHaveLength(2);
  });

  it('expands nesting and keeps conditions inside branches', () => {
    const [row] = toRuleRows(
      configWithRules([
        {
          type: 'logical',
          mode: 'and',
          rules: [
            { rule_set: ['geoip-cn'] },
            { type: 'logical', mode: 'or', rules: [{ domain_suffix: ['cn'] }], invert: true },
          ],
          outbound: 'direct',
        },
      ])
    );

    expect(row.group?.children[0]?.matchers).toContainEqual({ key: 'rule_set', values: ['geoip-cn'] });
    expect(row.group?.children[1]?.group?.invert).toBe(true);
    expect(row.group?.children[1]?.group?.children[0]?.matchers).toContainEqual({
      key: 'domain_suffix',
      values: ['cn'],
    });
  });

  it('searches by conditions of nested branches, not only the top level', () => {
    const [row] = toRuleRows(
      configWithRules([{ type: 'logical', mode: 'or', rules: [{ domain_suffix: ['media.example'] }] }])
    );

    expect(row.searchText).toContain('media.example');
  });
});

describe('actions other than route', () => {
  it('shows action parameters next to it', () => {
    const rows = toRuleRows(
      configWithRules([
        { port: 443, action: 'reject', method: 'drop' },
        { action: 'sniff', sniffer: ['tls', 'http'] },
        { port: 53, action: 'hijack-dns' },
      ])
    );

    expect(rows[0]?.targetDetail).toBe('method: drop');
    expect(rows[1]?.targetDetail).toBe('sniffer: tls, http');
    expect(rows[2]?.targetDetail).toBeNull();
  });

  it('does not confuse inversion with a condition', () => {
    const [row] = toRuleRows(configWithRules([{ rule_set: ['github'], invert: true, outbound: 'direct' }]));

    expect(row.invert).toBe(true);
    expect(row.matchers).toEqual([{ key: 'rule_set', values: ['github'] }]);
  });
  it('numbers rules by their place in the file, not by list order', () => {
    // The array is edited by a person, and a non-object that got into it is skipped. If the
    // position were counted after the skip, an edit of the next rule would go to
    // a neighboring node of the file.
    const rows = toRuleRowsFromNodes([null, { rule_set: ['github'], outbound: 'proxy' }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.index).toBe(2);
    expect(rows[0]?.id).toBe('1');
  });
});

describe('nodes the schema does not know', () => {
  it('a rule with an unknown condition is not counted as recognized', () => {
    expect(isRuleRecognized({ unknown_matcher: ['своё'], outbound: 'direct' })).toBe(false);
  });

  it('an ordinary rule is still recognized', () => {
    expect(isRuleRecognized({ domain_suffix: ['example.com'], outbound: 'direct' })).toBe(true);
  });

  it('the list row marks such a rule instead of passing it off as unconditional', () => {
    const [row] = toRuleRowsFromNodes([{ unknown_matcher: ['своё'], outbound: 'direct' }]);

    expect(row.recognized).toBe(false);
    expect(row.isCatchAll).toBe(true);
  });

  it('the schema issue names the field it does not know', () => {
    expect(checkRuleNode({ unknown_matcher: ['своё'], outbound: 'direct' }).join(' ')).toContain('unknown_matcher');
  });
});
