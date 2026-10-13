import { describe, expect, it } from 'vitest';

import { CONFIG_SECTION } from '../model/Config.model';
import {
  buildTagOfType,
  isNodeRecognized,
  newSectionNode,
  NODE_REGISTRY,
  nodeSchemaOf,
  nodeVariants,
  readNodeTags,
  registryOfSection,
} from '../model/Config.registry';

const VLESS = { type: 'vless', tag: 'hk-01', server: 'a.example', server_port: 443, uuid: 'REDACTED' };

describe('registryOfSection', () => {
  it.each([
    [CONFIG_SECTION.Inbounds, NODE_REGISTRY.Inbound],
    [CONFIG_SECTION.Outbounds, NODE_REGISTRY.Outbound],
    [CONFIG_SECTION.Dns, NODE_REGISTRY.Dns],
    [CONFIG_SECTION.Services, NODE_REGISTRY.Service],
    [CONFIG_SECTION.CertificateProviders, NODE_REGISTRY.CertificateProvider],
  ])('section %s takes types from registry %s', (section, registry) => {
    expect(registryOfSection(section)).toBe(registry);
  });

  it.each([CONFIG_SECTION.DnsRules, CONFIG_SECTION.Log, CONFIG_SECTION.HttpClients])(
    'section %s has no registry',
    (section) => {
      expect(registryOfSection(section)).toBeNull();
    }
  );
});

describe('nodeVariants', () => {
  it.each(Object.values(NODE_REGISTRY))('registry %s returns types without repeats', (registry) => {
    const types = nodeVariants(registry).map((variant) => variant.type);

    expect(types.length).toBeGreaterThan(0);
    expect(new Set(types).size).toBe(types.length);
  });

  it('outbounds include vless and direct', () => {
    const types = nodeVariants(NODE_REGISTRY.Outbound).map((variant) => variant.type);

    expect(types).toEqual(expect.arrayContaining(['vless', 'direct']));
  });

  it('a type schema is found by name, a foreign type is not', () => {
    expect(nodeSchemaOf(NODE_REGISTRY.Outbound, 'vless')).not.toBeNull();
    expect(nodeSchemaOf(NODE_REGISTRY.Outbound, 'no-such-type')).toBeNull();
  });
});

describe('isNodeRecognized', () => {
  it('accepts a node that the type schema knows entirely', () => {
    expect(isNodeRecognized(NODE_REGISTRY.Outbound, VLESS)).toBe(true);
  });

  it.each([
    ['a field the schema does not know', { ...VLESS, vendor_option: true }],
    ['a wrong value', { ...VLESS, server_port: -1 }],
    ['a type the registry does not know', { type: 'no-such-type', tag: 'x' }],
    ['a node without a type', { tag: 'x' }],
    ['a non-object', 'vless'],
  ])('does not recognize %s', (_, node) => {
    expect(isNodeRecognized(NODE_REGISTRY.Outbound, node)).toBe(false);
  });
});

describe('buildTagOfType', () => {
  it('names the build tag of a type and stays silent about a type without a gate', () => {
    expect(buildTagOfType(NODE_REGISTRY.Outbound, 'hysteria2')).toBe('with_quic');
    expect(buildTagOfType(NODE_REGISTRY.Outbound, 'direct')).toBeNull();
  });
});

describe('newSectionNode', () => {
  it('creates a node from only a type and a tag', () => {
    expect(newSectionNode('vless', 'hk-01')).toEqual({ type: 'vless', tag: 'hk-01' });
  });
});

describe('readNodeTags', () => {
  it('collects tags of all sections with a registry and skips nodes without a tag', () => {
    const text = `{
      // входы
      "inbounds": [{ "type": "mixed", "tag": "mixed-in" }],
      "outbounds": [{ "type": "direct", "tag": "direct" }, { "type": "block" }],
      "dns": { "servers": [{ "type": "local", "tag": "local" }], "rules": [{ "server": "local" }] },
      "route": { "rule_set": [{ "type": "inline", "tag": "ads" }] },
    }`;

    expect(readNodeTags(text)).toEqual(['mixed-in', 'direct', 'local']);
  });
});
