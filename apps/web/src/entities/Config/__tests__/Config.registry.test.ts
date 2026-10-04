import { describe, expect, it } from 'vitest';

import { CONFIG_SECTION } from '../model/Config.model';
import {
  buildTagOfType,
  isNodeRecognized,
  newSectionNode,
  NODE_REGISTRY,
  nodeSchemaOf,
  nodeVariants,
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
  ])('секция %s берёт типы из реестра %s', (section, registry) => {
    expect(registryOfSection(section)).toBe(registry);
  });

  it.each([CONFIG_SECTION.DnsRules, CONFIG_SECTION.Log, CONFIG_SECTION.HttpClients])(
    'у секции %s реестра нет',
    (section) => {
      expect(registryOfSection(section)).toBeNull();
    }
  );
});

describe('nodeVariants', () => {
  it.each(Object.values(NODE_REGISTRY))('реестр %s отдаёт типы без повторов', (registry) => {
    const types = nodeVariants(registry).map((variant) => variant.type);

    expect(types.length).toBeGreaterThan(0);
    expect(new Set(types).size).toBe(types.length);
  });

  it('у аутбаундов есть vless и direct', () => {
    const types = nodeVariants(NODE_REGISTRY.Outbound).map((variant) => variant.type);

    expect(types).toEqual(expect.arrayContaining(['vless', 'direct']));
  });

  it('схема типа находится по имени, чужой тип — нет', () => {
    expect(nodeSchemaOf(NODE_REGISTRY.Outbound, 'vless')).not.toBeNull();
    expect(nodeSchemaOf(NODE_REGISTRY.Outbound, 'no-such-type')).toBeNull();
  });
});

describe('isNodeRecognized', () => {
  it('принимает узел, который схема типа знает целиком', () => {
    expect(isNodeRecognized(NODE_REGISTRY.Outbound, VLESS)).toBe(true);
  });

  it.each([
    ['поле, которого схема не знает', { ...VLESS, vendor_option: true }],
    ['неверное значение', { ...VLESS, server_port: -1 }],
    ['тип, которого реестр не знает', { type: 'no-such-type', tag: 'x' }],
    ['узел без типа', { tag: 'x' }],
    ['не объект', 'vless'],
  ])('не распознаёт %s', (_, node) => {
    expect(isNodeRecognized(NODE_REGISTRY.Outbound, node)).toBe(false);
  });
});

describe('buildTagOfType', () => {
  it('называет тег сборки типа и молчит о типе без затвора', () => {
    expect(buildTagOfType(NODE_REGISTRY.Outbound, 'hysteria2')).toBe('with_quic');
    expect(buildTagOfType(NODE_REGISTRY.Outbound, 'direct')).toBeNull();
  });
});

describe('newSectionNode', () => {
  it('создаёт узел только из типа и тега', () => {
    expect(newSectionNode('vless', 'hk-01')).toEqual({ type: 'vless', tag: 'hk-01' });
  });
});
