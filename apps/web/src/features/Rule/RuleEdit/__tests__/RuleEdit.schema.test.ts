import { describe, expect, it } from 'vitest';

import { RULE_ACTION, RuleEditAdapterSchema } from '../model/RuleEdit.schema';

describe('правка исхода правила', () => {
  it('у маршрутизации отдаёт выбранный outbound', () => {
    const patch = RuleEditAdapterSchema.parse({ action: RULE_ACTION.Route, outbound: 'proxy' });

    expect(patch).toEqual({ action: RULE_ACTION.Route, outbound: 'proxy' });
  });

  it('у остальных действий не пишет outbound вовсе', () => {
    const patch = RuleEditAdapterSchema.parse({ action: RULE_ACTION.Reject, outbound: 'proxy' });

    expect(patch).toEqual({ action: RULE_ACTION.Reject });
    expect('outbound' in patch).toBe(false);
  });

  it('не принимает маршрутизацию без исхода: пустой тег попал бы в диф правкой, которой не делали', () => {
    const result = RuleEditAdapterSchema.safeParse({ action: RULE_ACTION.Route, outbound: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['outbound']);
  });

  it('не принимает действие, которого нет в списке', () => {
    expect(RuleEditAdapterSchema.safeParse({ action: 'teleport', outbound: '' }).success).toBe(false);
  });
});

describe('минимальность правки', () => {
  it('смена действия на не-маршрутизацию убирает outbound из патча, а не обнуляет его', () => {
    const patch = RuleEditAdapterSchema.parse({ action: RULE_ACTION.Sniff, outbound: 'proxy' });

    expect(Object.keys(patch)).toEqual(['action']);
  });
});
