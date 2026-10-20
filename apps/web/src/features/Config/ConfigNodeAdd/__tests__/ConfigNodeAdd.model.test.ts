import { describe, expect, it } from 'vitest';

import { NODE_REGISTRY } from '@entities/Config';

import { NODE_TYPE_GROUP, nodeTypeOptions, nodeTypeSections } from '../model/ConfigNodeAdd.model';

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

describe('nodeTypeSections', () => {
  it('describes every outbound type of the fork: a new type fails here until it gets a group and a line', () => {
    const undescribed = nodeTypeOptions(NODE_REGISTRY.Outbound, null).filter((option) => option.described === null);

    expect(undescribed.map((option) => option.type)).toEqual([]);
  });

  it('groups outbound types into proxy protocols, node groups and service types, in this order', () => {
    const sections = nodeTypeSections(nodeTypeOptions(NODE_REGISTRY.Outbound, null), NODE_REGISTRY.Outbound);
    const typesOf = (group: string) =>
      sections.find((section) => section.group === group)?.options.map((option) => option.type) ?? [];

    expect(sections.map((section) => section.group)).toEqual([
      NODE_TYPE_GROUP.Proxy,
      NODE_TYPE_GROUP.Group,
      NODE_TYPE_GROUP.Service,
    ]);
    expect(typesOf(NODE_TYPE_GROUP.Proxy)).toEqual(expect.arrayContaining(['vless', 'vmess', 'trojan', 'shadowsocks']));
    expect(typesOf(NODE_TYPE_GROUP.Group)).toEqual(expect.arrayContaining(['selector', 'urltest']));
    expect(typesOf(NODE_TYPE_GROUP.Service)).toEqual(expect.arrayContaining(['direct']));
  });

  it('puts an outbound type without an entry among the service types', () => {
    const sections = nodeTypeSections([{ type: 'future', unbuilt: null, described: null }], NODE_REGISTRY.Outbound);

    expect(sections).toEqual([
      { group: NODE_TYPE_GROUP.Service, options: [{ type: 'future', unbuilt: null, described: null }] },
    ]);
  });

  it('leaves the types of another registry as one ungrouped list without descriptions', () => {
    const options = nodeTypeOptions(NODE_REGISTRY.Inbound, null);

    expect(options.every((option) => option.described === null)).toBe(true);
    expect(nodeTypeSections(options, NODE_REGISTRY.Inbound)).toEqual([{ group: null, options }]);
  });
});
