import { describe, expect, it } from 'vitest';

import { RULE_ACTION, RuleEditAdapterSchema } from '../model/RuleEdit.schema';

const NO_CONDITIONS = { domain: '', domain_suffix: '', domain_keyword: '', ip_cidr: '', source_ip_cidr: '', port: '' };

describe('rule outbound edit', () => {
  it('for routing returns the chosen outbound', () => {
    const patch = RuleEditAdapterSchema.parse({
      name: '',
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(patch).toEqual({ action: RULE_ACTION.Route, outbound: 'proxy', conditions: {} });
  });

  it('for other actions does not write outbound at all', () => {
    const patch = RuleEditAdapterSchema.parse({
      name: '',
      action: RULE_ACTION.Reject,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(patch).toEqual({ action: RULE_ACTION.Reject, conditions: {} });
    expect('outbound' in patch).toBe(false);
  });

  it('does not accept routing without an outbound: an empty tag would get into the diff as an edit nobody made', () => {
    const result = RuleEditAdapterSchema.safeParse({
      name: '',
      action: RULE_ACTION.Route,
      outbound: '',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['outbound']);
  });

  it('does not accept an action that is not in the list', () => {
    expect(
      RuleEditAdapterSchema.safeParse({ action: 'teleport', outbound: '', ruleSet: [], conditions: NO_CONDITIONS })
        .success
    ).toBe(false);
  });
});

describe('rule sets of a rule', () => {
  it('go into the patch as a list of tags', () => {
    const patch = RuleEditAdapterSchema.parse({
      name: '',
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

  it('an empty list removes rule_set from the patch instead of writing []', () => {
    const patch = RuleEditAdapterSchema.parse({
      name: '',
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect('rule_set' in patch).toBe(false);
  });

  it('does not accept a tag that is not a string', () => {
    expect(
      RuleEditAdapterSchema.safeParse({
        name: '',
        action: RULE_ACTION.Route,
        outbound: 'proxy',
        ruleSet: [42],
        conditions: NO_CONDITIONS,
      }).success
    ).toBe(false);
  });
});

describe('edit minimality', () => {
  it('changing the action to non-routing removes outbound from the patch instead of zeroing it', () => {
    const patch = RuleEditAdapterSchema.parse({
      name: '',
      action: RULE_ACTION.Sniff,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(Object.keys(patch)).toEqual(['action', 'conditions']);
  });
});

describe('rule conditions', () => {
  it('go as a list with one string per value, empty strings and spaces are not written', () => {
    const patch = RuleEditAdapterSchema.parse({
      name: '',
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: { ...NO_CONDITIONS, domain_suffix: ' youtube.com \n\ngooglevideo.com', port: '443\n8443' },
    });

    expect(patch.conditions).toEqual({ domain_suffix: ['youtube.com', 'googlevideo.com'], port: [443, 8443] });
  });

  it('an empty condition removes the field from the node', () => {
    const patch = RuleEditAdapterSchema.parse({
      name: '',
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: NO_CONDITIONS,
    });

    expect(patch.conditions.domain).toBeUndefined();
  });

  it('does not accept a port that is not a number or is out of range', () => {
    for (const port of ['https', '70000']) {
      const result = RuleEditAdapterSchema.safeParse({
        name: '',
        action: RULE_ACTION.Route,
        outbound: 'proxy',
        ruleSet: [],
        conditions: { ...NO_CONDITIONS, port },
      });

      expect(result.error?.issues[0]?.path).toEqual(['conditions', 'port']);
    }
  });

  it('accepts an address or a subnet in both address conditions', () => {
    const result = RuleEditAdapterSchema.safeParse({
      name: '',
      action: RULE_ACTION.Route,
      outbound: 'proxy',
      ruleSet: [],
      conditions: {
        ...NO_CONDITIONS,
        ip_cidr: '10.0.0.0/8\nfd00::/8\n1.1.1.1',
        source_ip_cidr: '192.168.1.60/32\n::1',
      },
    });

    expect(result.success).toBe(true);
  });

  it('does not accept an address condition that is neither an address nor a subnet', () => {
    for (const condition of ['ip_cidr', 'source_ip_cidr'] as const) {
      for (const value of ['example.com', '10.0.0.0/33', '300.1.1.1']) {
        const result = RuleEditAdapterSchema.safeParse({
          name: '',
          action: RULE_ACTION.Route,
          outbound: 'proxy',
          ruleSet: [],
          conditions: { ...NO_CONDITIONS, [condition]: value },
        });

        expect(result.error?.issues[0]?.path).toEqual(['conditions', condition]);
      }
    }
  });
});
