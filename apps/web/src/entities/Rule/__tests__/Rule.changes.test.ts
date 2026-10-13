import { describe, expect, it } from 'vitest';

import { RULE_CHANGE, toRuleChanges } from '../model/Rule.changes';

const DNS = { protocol: 'dns', action: 'hijack-dns' };
const GOOGLE = { rule_set: 'google-ip', outbound: 'proxy' };
const LOCAL = { ip_is_private: true, outbound: 'direct' };
const ADS = { rule_set: 'ads', action: 'reject' };

describe('toRuleChanges', () => {
  it('without edits finds no changes', () => {
    expect(toRuleChanges([DNS, GOOGLE], [DNS, GOOGLE])).toEqual([]);
  });

  it('an outbound change with the same conditions shows the old and new outbound', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL], [DNS, { ...GOOGLE, outbound: 'direct' }, LOCAL])).toEqual([
      { kind: RULE_CHANGE.Target, index: 2, from: 'proxy', to: 'direct' },
    ]);
  });

  it('a change of outbound to an action is named the same as an outbound change', () => {
    expect(toRuleChanges([GOOGLE], [{ rule_set: 'google-ip', action: 'reject' }])).toEqual([
      { kind: RULE_CHANGE.Target, index: 1, from: 'proxy', to: 'reject' },
    ]);
  });

  it('names a conditions edit a rule change', () => {
    expect(toRuleChanges([DNS, GOOGLE], [DNS, { ...GOOGLE, rule_set: 'google-ip-v2' }])).toEqual([
      { kind: RULE_CHANGE.Changed, index: 2 },
    ]);
  });

  it('names a parameter edit with the same action a change', () => {
    expect(toRuleChanges([ADS], [{ ...ADS, method: 'drop' }])).toEqual([{ kind: RULE_CHANGE.Changed, index: 1 }]);
  });

  it('numbers the added by the draft, the removed by the applied config', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL], [DNS, LOCAL, ADS])).toEqual([
      { kind: RULE_CHANGE.Removed, index: 2 },
      { kind: RULE_CHANGE.Added, index: 3 },
    ]);
  });

  it('does not pass an insert next to an edit off as an edit of the neighboring rule', () => {
    expect(toRuleChanges([DNS, GOOGLE], [DNS, ADS, { ...GOOGLE, outbound: 'direct' }])).toEqual([
      { kind: RULE_CHANGE.Added, index: 2 },
      { kind: RULE_CHANGE.Target, index: 3, from: 'proxy', to: 'direct' },
    ]);
  });

  it('names a moved rule a move, not a deletion and an addition', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL, ADS], [DNS, LOCAL, ADS, GOOGLE])).toEqual([
      { kind: RULE_CHANGE.Moved, index: 4, previous: 2 },
    ]);
  });

  it('names a moved and edited rule a change, not a deletion and an addition', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL, ADS], [DNS, LOCAL, ADS, { ...GOOGLE, outbound: 'direct' }])).toEqual([
      { kind: RULE_CHANGE.Target, index: 4, from: 'proxy', to: 'direct' },
    ]);
    expect(toRuleChanges([DNS, ADS, GOOGLE, LOCAL], [DNS, GOOGLE, LOCAL, { ...ADS, method: 'drop' }])).toEqual([
      { kind: RULE_CHANGE.Changed, index: 4 },
    ]);
  });

  it('parses an empty list on both sides', () => {
    expect(toRuleChanges([], [DNS, GOOGLE])).toEqual([
      { kind: RULE_CHANGE.Added, index: 1 },
      { kind: RULE_CHANGE.Added, index: 2 },
    ]);
    expect(toRuleChanges([DNS], [])).toEqual([{ kind: RULE_CHANGE.Removed, index: 1 }]);
  });
});
