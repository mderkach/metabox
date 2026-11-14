import { ConfigDocumentState, findValue, readRules } from '@entities/Config';
import { RULE_TARGET, toRuleRowsFromNodes, type RuleRow } from '@entities/Rule';

export const DOCUMENT = {
  outbounds: [
    { type: 'direct', tag: 'direct' },
    { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
  ],
  route: {
    rules: [{ rule_set: ['github'], outbound: 'proxy' }],
    rule_set: [
      {
        type: 'remote',
        tag: 'github',
        format: 'binary',
        url: 'https://example.invalid/github.srs',
      },
      {
        type: 'remote',
        tag: 'geoip-cn',
        format: 'binary',
        url: 'https://example.invalid/geoip-cn.srs',
      },
    ],
  },
};

export const CONFIG = JSON.stringify(DOCUMENT, null, 2);

export const RULE_SETS = ['github', 'geoip-cn'];

export const RULE: RuleRow = {
  id: '0',
  index: 1,
  name: null,
  matchers: [{ key: 'rule_set', values: ['github'] }],
  group: null,
  invert: false,
  target: 'proxy',
  targetKind: RULE_TARGET.Outbound,
  targetDetail: null,
  isCatchAll: false,
  recognized: true,
  searchText: 'rule_set github proxy',
};

/** A document with one rule: the rule row is built by the same adapter as on the screen. */
export function loadRule(rule: object): RuleRow {
  const text = JSON.stringify({ ...DOCUMENT, route: { ...DOCUMENT.route, rules: [rule] } }, null, 2);

  ConfigDocumentState.getState().reset();
  ConfigDocumentState.getState().load(text);

  const row = toRuleRowsFromNodes(readRules(text)).at(0);

  if (row === undefined) {
    throw new Error('Правило не разобралось');
  }

  return row;
}

export function draftRule(): unknown {
  return findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0]);
}
