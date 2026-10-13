import { describe, expect, it } from 'vitest';

import { NODE_REGISTRY } from '@entities/Config';

import { nodeTypeOptions } from '../model/ConfigNodeAdd.model';

describe('nodeTypeOptions', () => {
  it('returns registry types by name', () => {
    const types = nodeTypeOptions(NODE_REGISTRY.Outbound, null).map((option) => option.type);

    expect(types).toEqual([...types].sort((left, right) => left.localeCompare(right, 'en')));
    expect(types).toEqual(expect.arrayContaining(['direct', 'vless', 'hysteria2']));
  });

  it('marks a type whose tag is not in the build, and does not mark a type without a gate', () => {
    const options = nodeTypeOptions(NODE_REGISTRY.Outbound, ['with_utls']);

    expect(options.find((option) => option.type === 'hysteria2')?.unbuilt).toBe('with_quic');
    expect(options.find((option) => option.type === 'direct')?.unbuilt).toBeNull();
  });

  it('marks nothing until the build composition is read', () => {
    expect(nodeTypeOptions(NODE_REGISTRY.Outbound, null).every((option) => option.unbuilt === null)).toBe(true);
  });
});
