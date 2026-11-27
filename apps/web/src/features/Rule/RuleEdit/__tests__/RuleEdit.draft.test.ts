import { afterEach, describe, expect, it } from 'vitest';

import { ConfigDocumentStore, readRules, selectConfigCurrent } from '@entities/Config';

import { toRuleEditValues, writeRuleEdit } from '../model/RuleEdit.model';
import { RULE_ACTION, RuleEditAdapterSchema } from '../model/RuleEdit.schema';
import { loadRule } from './RuleEditForm.fixture';

describe('rule draft publications', () => {
  afterEach(() => {
    ConfigDocumentStore.getState().reset();
  });

  it('publishes the new action and removal of the previous outbound together', () => {
    const rule = loadRule({ domain: ['example.com'], outbound: 'proxy' });
    const values = { ...toRuleEditValues(rule), action: RULE_ACTION.Reject, outbound: '' };
    const published: unknown[] = [];
    const unsubscribe = ConfigDocumentStore.subscribe((state) => {
      published.push(readRules(selectConfigCurrent(state) ?? '')[0]);
    });
    try {
      writeRuleEdit(rule.index, RuleEditAdapterSchema.parse(values), values, true);
      expect(published).toEqual([{ domain: ['example.com'], action: 'reject' }]);
    } finally {
      unsubscribe();
    }
  });
});
