import { describe, expect, it } from 'vitest';

import { NODE_REGISTRY } from '@entities/Config';

import { nodeTypeOptions } from '../model/ConfigNodeAdd.model';

describe('nodeTypeOptions', () => {
  it('отдаёт типы реестра по имени', () => {
    const types = nodeTypeOptions(NODE_REGISTRY.Outbound, null).map((option) => option.type);

    expect(types).toEqual([...types].sort((left, right) => left.localeCompare(right, 'en')));
    expect(types).toEqual(expect.arrayContaining(['direct', 'vless', 'hysteria2']));
  });

  it('помечает тип, тега которого нет в сборке, и не помечает тип без затвора', () => {
    const options = nodeTypeOptions(NODE_REGISTRY.Outbound, ['with_utls']);

    expect(options.find((option) => option.type === 'hysteria2')?.unbuilt).toBe('with_quic');
    expect(options.find((option) => option.type === 'direct')?.unbuilt).toBeNull();
  });

  it('не помечает ничего, пока состав сборки не прочитан', () => {
    expect(nodeTypeOptions(NODE_REGISTRY.Outbound, null).every((option) => option.unbuilt === null)).toBe(true);
  });
});
