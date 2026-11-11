import { describe, expect, it } from 'vitest';

import { actionOutsideForm } from '../model/RuleEdit.model';
import { RULE_ACTION } from '../model/RuleEdit.schema';

describe('rule action outside the form', () => {
  it('names an action the form does not edit', () => {
    expect(actionOutsideForm({ domain: ['example.com'], action: 'resolve', server: 'local' })).toBe('resolve');
    expect(actionOutsideForm({ domain: ['example.com'], action: 'bypass', outbound: 'proxy' })).toBe('bypass');
  });

  it('lets the form open a rule without an action key or with its own action', () => {
    expect(actionOutsideForm({ domain: ['example.com'], outbound: 'proxy' })).toBeNull();
    expect(actionOutsideForm({ domain: ['example.com'], action: RULE_ACTION.Sniff })).toBeNull();
    expect(actionOutsideForm(undefined)).toBeNull();
  });
});
