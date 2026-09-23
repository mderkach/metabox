import { describe, expect, it } from 'vitest';

import { RULE_CHANGE, toRuleChanges } from '../model/Rule.changes';

const DNS = { protocol: 'dns', action: 'hijack-dns' };
const GOOGLE = { rule_set: 'google-ip', outbound: 'proxy' };
const LOCAL = { ip_is_private: true, outbound: 'direct' };
const ADS = { rule_set: 'ads', action: 'reject' };

describe('toRuleChanges', () => {
  it('без правок изменений не находит', () => {
    expect(toRuleChanges([DNS, GOOGLE], [DNS, GOOGLE])).toEqual([]);
  });

  it('смену аутбаунда при тех же условиях показывает старый и новый аутбаунд', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL], [DNS, { ...GOOGLE, outbound: 'direct' }, LOCAL])).toEqual([
      { kind: RULE_CHANGE.Target, index: 2, from: 'proxy', to: 'direct' },
    ]);
  });

  it('смену аутбаунда на действие называет так же, как смену аутбаунда', () => {
    expect(toRuleChanges([GOOGLE], [{ rule_set: 'google-ip', action: 'reject' }])).toEqual([
      { kind: RULE_CHANGE.Target, index: 1, from: 'proxy', to: 'reject' },
    ]);
  });

  it('правку условий называет изменением правила', () => {
    expect(toRuleChanges([DNS, GOOGLE], [DNS, { ...GOOGLE, rule_set: 'google-ip-v2' }])).toEqual([
      { kind: RULE_CHANGE.Changed, index: 2 },
    ]);
  });

  it('правку параметра при том же действии называет изменением', () => {
    expect(toRuleChanges([ADS], [{ ...ADS, method: 'drop' }])).toEqual([{ kind: RULE_CHANGE.Changed, index: 1 }]);
  });

  it('нумерует добавленное по черновику, удалённое — по применённому конфигу', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL], [DNS, LOCAL, ADS])).toEqual([
      { kind: RULE_CHANGE.Removed, index: 2 },
      { kind: RULE_CHANGE.Added, index: 3 },
    ]);
  });

  it('вставку рядом с правкой не выдаёт за правку соседнего правила', () => {
    expect(toRuleChanges([DNS, GOOGLE], [DNS, ADS, { ...GOOGLE, outbound: 'direct' }])).toEqual([
      { kind: RULE_CHANGE.Added, index: 2 },
      { kind: RULE_CHANGE.Target, index: 3, from: 'proxy', to: 'direct' },
    ]);
  });

  it('переставленное правило называет перемещением, а не удалением и добавлением', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL, ADS], [DNS, LOCAL, ADS, GOOGLE])).toEqual([
      { kind: RULE_CHANGE.Moved, index: 4, previous: 2 },
    ]);
  });

  it('переставленное и поправленное правило называет изменением, а не удалением и добавлением', () => {
    expect(toRuleChanges([DNS, GOOGLE, LOCAL, ADS], [DNS, LOCAL, ADS, { ...GOOGLE, outbound: 'direct' }])).toEqual([
      { kind: RULE_CHANGE.Target, index: 4, from: 'proxy', to: 'direct' },
    ]);
    expect(toRuleChanges([DNS, ADS, GOOGLE, LOCAL], [DNS, GOOGLE, LOCAL, { ...ADS, method: 'drop' }])).toEqual([
      { kind: RULE_CHANGE.Changed, index: 4 },
    ]);
  });

  it('разбирает пустой список с обеих сторон', () => {
    expect(toRuleChanges([], [DNS, GOOGLE])).toEqual([
      { kind: RULE_CHANGE.Added, index: 1 },
      { kind: RULE_CHANGE.Added, index: 2 },
    ]);
    expect(toRuleChanges([DNS], [])).toEqual([{ kind: RULE_CHANGE.Removed, index: 1 }]);
  });
});
