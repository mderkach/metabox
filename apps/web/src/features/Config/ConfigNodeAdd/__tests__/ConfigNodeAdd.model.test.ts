import { describe, expect, it } from 'vitest';

import { NODE_REGISTRY } from '@entities/Config';

import { NODE_TYPE_GROUP, nodeTypeDocsUrl, nodeTypeOptions, nodeTypeSections } from '../model/ConfigNodeAdd.model';

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

  it('describes every inbound type of the fork', () => {
    const undescribed = nodeTypeOptions(NODE_REGISTRY.Inbound, null).filter((option) => option.described === null);

    expect(undescribed.map((option) => option.type)).toEqual([]);
  });

  it('groups inbound types into router, proxy server and other, in this order', () => {
    const sections = nodeTypeSections(nodeTypeOptions(NODE_REGISTRY.Inbound, null), NODE_REGISTRY.Inbound);
    const typesOf = (group: string) =>
      sections.find((section) => section.group === group)?.options.map((option) => option.type) ?? [];

    expect(sections.map((section) => section.group)).toEqual([
      NODE_TYPE_GROUP.Router,
      NODE_TYPE_GROUP.Server,
      NODE_TYPE_GROUP.Other,
    ]);
    expect(typesOf(NODE_TYPE_GROUP.Router)).toEqual(['mixed', 'redirect', 'tproxy', 'tun']);
    expect(typesOf(NODE_TYPE_GROUP.Server)).toEqual(expect.arrayContaining(['vless', 'shadowsocks', 'hysteria2']));
    expect(typesOf(NODE_TYPE_GROUP.Other)).toEqual(expect.arrayContaining(['direct']));
  });

  it('puts an inbound type without an entry into the last group', () => {
    const sections = nodeTypeSections([{ type: 'future', unbuilt: null, described: null }], NODE_REGISTRY.Inbound);

    expect(sections.map((section) => section.group)).toEqual([NODE_TYPE_GROUP.Other]);
  });

  it('leaves the types of a registry without groups as one ungrouped list without descriptions', () => {
    const options = nodeTypeOptions(NODE_REGISTRY.Endpoint, null);

    expect(options.every((option) => option.described === null)).toBe(true);
    expect(nodeTypeSections(options, NODE_REGISTRY.Endpoint)).toEqual([{ group: null, options }]);
  });
});

describe('nodeTypeDocsUrl', () => {
  it('links an inbound type to its page in the fork documentation', () => {
    expect(nodeTypeDocsUrl(NODE_REGISTRY.Inbound, 'tun')).toBe(
      'https://github.com/shtorm-7/sing-box-extended/blob/extended/docs/configuration/inbound/tun.md'
    );
  });

  it('has no link for a type the fork did not document, or for another registry', () => {
    expect(nodeTypeDocsUrl(NODE_REGISTRY.Inbound, 'mtproxy')).toBeNull();
    expect(nodeTypeDocsUrl(NODE_REGISTRY.Outbound, 'vless')).toBeNull();
  });
});
