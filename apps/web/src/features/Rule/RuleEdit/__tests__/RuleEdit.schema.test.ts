import { describe, expect, it } from 'vitest';

import { RULE_ACTION, RuleEditAdapterSchema } from '../model/RuleEdit.schema';

describe('правка выхода правила', () => {
  it('у маршрутизации отдаёт выбранный outbound', () => {
    const patch = RuleEditAdapterSchema.parse({ action: RULE_ACTION.Route, outbound: 'proxy', ruleSet: [] });

    expect(patch).toEqual({ action: RULE_ACTION.Route, outbound: 'proxy' });
  });

  it('у остальных действий не пишет outbound вовсе', () => {
    const patch = RuleEditAdapterSchema.parse({ action: RULE_ACTION.Reject, outbound: 'proxy', ruleSet: [] });

    expect(patch).toEqual({ action: RULE_ACTION.Reject });
    expect('outbound' in patch).toBe(false);
  });

  it('не принимает маршрутизацию без выхода: пустой тег попал бы в диф правкой, которой не делали', () => {
    const result = RuleEditAdapterSchema.safeParse({ action: RULE_ACTION.Route, outbound: '', ruleSet: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['outbound']);
  });

  it('не принимает действие, которого нет в списке', () => {
    expect(RuleEditAdapterSchema.safeParse({ action: 'teleport', outbound: '', ruleSet: [] }).success).toBe(false);
  });
});

describe('сеты правила', () => {
  it('уходят в патч списком тегов', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: ['github', 'geoip-cn'],
    });

    expect(patch).toEqual({ action: RULE_ACTION.Route, outbound: 'proxy', rule_set: ['github', 'geoip-cn'] });
  });

  it('пустой список убирает rule_set из патча, а не пишет []', () => {
    const patch = RuleEditAdapterSchema.parse({ action: RULE_ACTION.Route, outbound: 'proxy', ruleSet: [] });

    expect('rule_set' in patch).toBe(false);
  });

  it('не принимает тег не строкой', () => {
    expect(
      RuleEditAdapterSchema.safeParse({ action: RULE_ACTION.Route, outbound: 'proxy', ruleSet: [42] }).success
    ).toBe(false);
  });
});

describe('минимальность правки', () => {
  it('смена действия на не-маршрутизацию убирает outbound из патча, а не обнуляет его', () => {
    const patch = RuleEditAdapterSchema.parse({ action: RULE_ACTION.Sniff, outbound: 'proxy', ruleSet: [] });

    expect(Object.keys(patch)).toEqual(['action']);
  });
});
