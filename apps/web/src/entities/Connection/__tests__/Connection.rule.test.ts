import { describe, expect, it } from 'vitest';

import { routeOutboundOf, toActionText, toRuleText, toRuleTextParts } from '../model/Connection.rule';

describe('toRuleTextParts', () => {
  it('splits conditions at their keys', () => {
    expect(toRuleTextParts('rule_set=github port=443')).toEqual([
      { key: 'rule_set', text: 'github' },
      { key: 'port', text: '443' },
    ]);
  });

  it('keeps text without a key as is', () => {
    expect(toRuleTextParts('final')).toEqual([{ key: null, text: 'final' }]);
  });

  it('gives no parts for an empty rule', () => {
    expect(toRuleTextParts('')).toEqual([]);
  });
});

describe('routeOutboundOf', () => {
  it('takes the outbound out of route(…)', () => {
    expect(routeOutboundOf('route(us-fallback)')).toBe('us-fallback');
  });

  it('gives null for other actions', () => {
    expect(routeOutboundOf('reject')).toBeNull();
  });
});

describe('toRuleText and toActionText', () => {
  it('names known conditions and keeps unknown ones as key=value', () => {
    expect(toRuleText('rule_set=github wifi_bssid=aa', (key) => (key === 'rule_set' ? 'Сет правил' : null))).toBe(
      'Сет правил: github, wifi_bssid=aa'
    );
  });

  it('reads route(x) through via and names other actions', () => {
    const via = (outbound: string) => `через ${outbound}`;
    const nameOf = (action: string) => (action === 'reject' ? 'оборвать' : null);

    expect(toActionText('route(proxy)', via, nameOf)).toBe('через proxy');
    expect(toActionText('reject', via, nameOf)).toBe('оборвать');
    expect(toActionText('bypass', via, nameOf)).toBe('bypass');
  });
});
