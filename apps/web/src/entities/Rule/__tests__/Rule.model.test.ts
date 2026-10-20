import { describe, expect, it } from 'vitest';

import { toRuleRowsFromNodes } from '../model/Rule.adapter';
import { newRulePlace, toNewRuleRow } from '../model/Rule.model';

describe('newRulePlace', () => {
  it('puts the new rule before an unconditional rule to an outbound and takes its outbound', () => {
    const rows = toRuleRowsFromNodes([
      { action: 'sniff' },
      { domain_suffix: ['example.com'], outbound: 'proxy' },
      { outbound: 'direct' },
    ]);

    expect(newRulePlace(rows, 3, 'node-a')).toEqual({ index: 3, outbound: 'direct' });
  });

  it('does not stop at an unconditional rule that only sniffs or hijacks DNS: the list goes on after it', () => {
    const rows = toRuleRowsFromNodes([{ action: 'sniff' }, { domain: ['a.example'], outbound: 'proxy' }]);

    expect(newRulePlace(rows, 2, 'direct')).toEqual({ index: 3, outbound: 'direct' });
  });

  it('counts non-object nodes in the position at the end of the list', () => {
    const rows = toRuleRowsFromNodes([{ domain: ['a.example'], outbound: 'proxy' }, 'not a rule']);

    expect(newRulePlace(rows, 2, 'direct')).toEqual({ index: 3, outbound: 'direct' });
  });

  it('puts the new rule before an unconditional reject with the default outbound', () => {
    const rows = toRuleRowsFromNodes([{ domain: ['a.example'], outbound: 'proxy' }, { action: 'reject' }]);

    expect(newRulePlace(rows, 2, 'direct')).toEqual({ index: 2, outbound: 'direct' });
  });

  it('gives no place without an outbound to take', () => {
    expect(newRulePlace([], 0, null)).toBeNull();
  });
});

describe('toNewRuleRow', () => {
  it('reads a rule that is not in the document as unconditional with the chosen outbound', () => {
    expect(toNewRuleRow({ index: 3, outbound: 'direct' })).toMatchObject({
      index: 3,
      matchers: [],
      target: 'direct',
      isCatchAll: true,
      recognized: true,
    });
  });
});
