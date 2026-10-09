import { describe, expect, it } from 'vitest';

import { RULE_ACTION, RuleEditAdapterSchema } from '../model/RuleEdit.schema';

const NO_CONDITIONS = { domain: '', domain_suffix: '', domain_keyword: '', ip_cidr: '', port: '' };

describe('правка выхода правила', () => {
  it('у маршрутизации отдаёт выбранный outbound', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(patch).toEqual({ action: RULE_ACTION.Route, outbound: 'proxy', conditions: {} });
  });

  it('у остальных действий не пишет outbound вовсе', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Reject,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(patch).toEqual({ action: RULE_ACTION.Reject, conditions: {} });
    expect('outbound' in patch).toBe(false);
  });

  it('не принимает маршрутизацию без выхода: пустой тег попал бы в диф правкой, которой не делали', () => {
    const result = RuleEditAdapterSchema.safeParse({
      action: RULE_ACTION.Route,
      outbound: '',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['outbound']);
  });

  it('не принимает действие, которого нет в списке', () => {
    expect(
      RuleEditAdapterSchema.safeParse({ action: 'teleport', outbound: '', ruleSet: [], conditions: NO_CONDITIONS })
        .success
    ).toBe(false);
  });
});

describe('сеты правила', () => {
  it('уходят в патч списком тегов', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: ['github', 'geoip-cn'],
      conditions: NO_CONDITIONS,
    });

    expect(patch).toEqual({
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      rule_set: ['github', 'geoip-cn'],
      conditions: {},
    });
  });

  it('пустой список убирает rule_set из патча, а не пишет []', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect('rule_set' in patch).toBe(false);
  });

  it('не принимает тег не строкой', () => {
    expect(
      RuleEditAdapterSchema.safeParse({
        action: RULE_ACTION.Route,
        outbound: 'proxy',
        ruleSet: [42],
        conditions: NO_CONDITIONS,
      }).success
    ).toBe(false);
  });
});

describe('минимальность правки', () => {
  it('смена действия на не-маршрутизацию убирает outbound из патча, а не обнуляет его', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Sniff,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(Object.keys(patch)).toEqual(['action', 'conditions']);
  });
});

describe('условия правила', () => {
  it('уходят списком по строке на значение, пустые строки и пробелы не пишутся', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: { ...NO_CONDITIONS, domain_suffix: ' youtube.com \n\ngooglevideo.com', port: '443\n8443' },
    });

    expect(patch.conditions).toEqual({ domain_suffix: ['youtube.com', 'googlevideo.com'], port: [443, 8443] });
  });

  it('пустое условие убирает поле из узла', () => {
    const patch = RuleEditAdapterSchema.parse({
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(patch.conditions.domain).toBeUndefined();
  });

  it('не принимает порт не числом и вне диапазона', () => {
    for (const port of ['https', '70000']) {
      const result = RuleEditAdapterSchema.safeParse({
        action: RULE_ACTION.Route,
        outbound: 'proxy',
        ruleSet: [],
        conditions: { ...NO_CONDITIONS, port },
      });

      expect(result.error?.issues[0]?.path).toEqual(['conditions', 'port']);
    }
  });
});
