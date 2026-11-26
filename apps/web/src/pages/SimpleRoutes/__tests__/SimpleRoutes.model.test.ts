import { describe, expect, it } from 'vitest';

import type { ConfigDocument } from '@entities/Config';

import { toSimpleRoutes } from '../model/SimpleRoutes.model';

type Outbounds = NonNullable<ConfigDocument['outbounds']>;

function outboundKeys(outbounds: Outbounds) {
  const config: ConfigDocument = { outbounds };
  return toSimpleRoutes(config, JSON.stringify(config), null).outboundEntries.map(({ key }) => key);
}

describe('Simple Routes outbound identity', () => {
  it('keeps keys attached to tagged outbounds when the list changes', () => {
    const direct = { type: 'direct', tag: 'direct' } as const;
    const office: Outbounds[number] = { type: 'selector', tag: 'office', outbounds: ['direct'] };
    const [directKey, officeKey] = outboundKeys([direct, office]);
    const other = { type: 'direct', tag: 'other' } as const;

    expect(outboundKeys([{ ...office, outbounds: ['other'] }, direct, other])).toEqual([
      officeKey,
      directKey,
      ...outboundKeys([other]),
    ]);
  });

  it('distinguishes duplicate and untagged imported outbounds', () => {
    const direct = { type: 'direct', tag: 'shared' } as const;
    const selector: Outbounds[number] = { type: 'selector', tag: 'shared', outbounds: ['direct'] };
    const untagged = { type: 'direct' } as const;
    const original = outboundKeys([direct, selector, untagged, untagged]);
    const [directKey, selectorKey, firstUntaggedKey, secondUntaggedKey] = original;

    expect(new Set(original).size).toBe(original.length);
    expect(outboundKeys([untagged, selector, direct, untagged])).toEqual([
      firstUntaggedKey,
      selectorKey,
      directKey,
      secondUntaggedKey,
    ]);
  });
});
