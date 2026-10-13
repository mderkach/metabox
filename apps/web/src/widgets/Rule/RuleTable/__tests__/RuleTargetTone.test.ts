import { describe, expect, it } from 'vitest';

import { RULE_TARGET } from '@entities/Rule';

import { toTargetTone } from '../ui/RuleTargetTone';

const OUTBOUND_TYPES: ReadonlyMap<string, string> = new Map([
  ['directional', 'vless'],
  ['eu', 'direct'],
  ['auto', 'selector'],
  ['sink', 'block'],
]);

const NO_TYPES: ReadonlyMap<string, string> = new Map();

describe('rule outbound tone', () => {
  it('an outbound from the config is colored by type, not by tag name', () => {
    expect(toTargetTone(RULE_TARGET.Outbound, 'directional', OUTBOUND_TYPES)).toBe('text-route-proxy');
    expect(toTargetTone(RULE_TARGET.Outbound, 'eu', OUTBOUND_TYPES)).toBe('text-route-direct');
    expect(toTargetTone(RULE_TARGET.Outbound, 'sink', OUTBOUND_TYPES)).toBe('text-route-block');
  });

  it('an unknown type routes traffic through a node: the proxy tone', () => {
    expect(toTargetTone(RULE_TARGET.Outbound, 'auto', OUTBOUND_TYPES)).toBe('text-route-proxy');
  });

  it('a tag that is not in the config is colored by name', () => {
    expect(toTargetTone(RULE_TARGET.Outbound, 'direct-ru', NO_TYPES)).toBe('text-route-direct');
    expect(toTargetTone(RULE_TARGET.Outbound, 'hk-01', NO_TYPES)).toBe('text-route-proxy');
  });

  it('an action is colored by name, even when an outbound with such a tag exists', () => {
    const types = new Map([['reject', 'vless']]);

    expect(toTargetTone(RULE_TARGET.Action, 'reject', types)).toBe('text-route-block');
    expect(toTargetTone(RULE_TARGET.Action, 'hijack-dns', NO_TYPES)).toBe('text-route-dns');
    expect(toTargetTone(RULE_TARGET.Action, 'sniff', NO_TYPES)).toBe('text-route-neutral');
  });
});
