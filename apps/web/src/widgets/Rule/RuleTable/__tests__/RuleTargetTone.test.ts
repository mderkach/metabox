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

describe('тон выхода правила', () => {
  it('аутбаунд из конфига красится по типу, а не по имени тега', () => {
    expect(toTargetTone(RULE_TARGET.Outbound, 'directional', OUTBOUND_TYPES)).toBe('text-route-proxy');
    expect(toTargetTone(RULE_TARGET.Outbound, 'eu', OUTBOUND_TYPES)).toBe('text-route-direct');
    expect(toTargetTone(RULE_TARGET.Outbound, 'sink', OUTBOUND_TYPES)).toBe('text-route-block');
  });

  it('незнакомый тип выводит трафик через узел — тон прокси', () => {
    expect(toTargetTone(RULE_TARGET.Outbound, 'auto', OUTBOUND_TYPES)).toBe('text-route-proxy');
  });

  it('тег, которого в конфиге нет, красится по имени', () => {
    expect(toTargetTone(RULE_TARGET.Outbound, 'direct-ru', NO_TYPES)).toBe('text-route-direct');
    expect(toTargetTone(RULE_TARGET.Outbound, 'hk-01', NO_TYPES)).toBe('text-route-proxy');
  });

  it('действие красится по имени, даже когда аутбаунд с таким тегом есть', () => {
    const types = new Map([['reject', 'vless']]);

    expect(toTargetTone(RULE_TARGET.Action, 'reject', types)).toBe('text-route-block');
    expect(toTargetTone(RULE_TARGET.Action, 'hijack-dns', NO_TYPES)).toBe('text-route-dns');
    expect(toTargetTone(RULE_TARGET.Action, 'sniff', NO_TYPES)).toBe('text-route-neutral');
  });
});
