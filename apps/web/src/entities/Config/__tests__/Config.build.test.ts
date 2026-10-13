import { describe, expect, it } from 'vitest';

import { findUnbuiltNodes, findUnbuiltOptions, unbuiltOptionOf } from '../model/Config.build';
import type { ConfigDocument } from '../model/Config.model';

const CONFIG = {
  outbounds: [
    { type: 'direct', tag: 'direct' },
    { type: 'hysteria2', tag: 'hy2-node', server: 'example.org', server_port: 443 },
  ],
  services: [{ type: 'ccm' }],
  dns: { servers: [{ type: 'quic', tag: 'dns-quic', server: '1.1.1.1' }] },
} satisfies ConfigDocument;

describe('findUnbuiltNodes', () => {
  it('finds nodes whose type is gated by a tag absent from the build', () => {
    expect(findUnbuiltNodes(CONFIG, ['with_quic'])).toEqual([
      {
        section: 'services',
        index: 0,
        tag: null,
        type: 'ccm',
        buildTag: 'with_ccm',
      },
    ]);
  });

  it('also checks the nested DNS section', () => {
    const found = findUnbuiltNodes(CONFIG, ['with_ccm']);

    expect(found.map((node) => `${node.section}[${String(node.index)}] ${node.type}`)).toEqual([
      'outbounds[1] hysteria2',
      'dns.servers[0] quic',
    ]);
  });

  it('stays silent when the build composition has not been read', () => {
    expect(findUnbuiltNodes(CONFIG, null)).toEqual([]);
  });

  it('treats a build without tags as a build without gated types', () => {
    expect(findUnbuiltNodes(CONFIG, [])).toHaveLength(3);
  });
});

const OPTION_CONFIG = {
  inbounds: [
    { type: 'tun', tag: 'tun-gvisor', stack: 'gvisor' },
    { type: 'tun', tag: 'tun-mixed', stack: 'mixed' },
    { type: 'tun', tag: 'tun-system', stack: 'system' },
    { type: 'mixed', tag: 'proxy-in' },
  ],
  outbounds: [
    { type: 'vless', tag: 'v1', server: 'a.example', tls: { enabled: true, utls: { enabled: true } } },
    { type: 'vless', tag: 'v2', server: 'b.example', tls: { enabled: true, utls: { enabled: false } } },
  ],
  dns: { servers: [{ type: 'https', tag: 'doh', tls: { utls: { enabled: true } } }] },
  experimental: { clash_api: { external_controller: '127.0.0.1:9090' }, v2ray_api: {} },
} satisfies ConfigDocument;

describe('findUnbuiltOptions', () => {
  it('finds enabled options whose tags are not in the build', () => {
    const found = findUnbuiltOptions(OPTION_CONFIG, []);

    expect(found.map((option) => `${option.path} ${option.buildTag}`)).toEqual([
      'experimental.clash_api with_clash_api',
      'experimental.v2ray_api with_v2ray_api',
      'outbounds[0].tls.utls with_utls',
      'dns.servers[0].tls.utls with_utls',
      'inbounds[0].stack with_gvisor',
      'inbounds[1].stack with_gvisor',
    ]);
  });

  it('stays silent with a full tag set', () => {
    const tags = ['with_clash_api', 'with_v2ray_api', 'with_utls', 'with_gvisor'];

    expect(findUnbuiltOptions(OPTION_CONFIG, tags)).toEqual([]);
  });

  it('stays silent when the build composition has not been read', () => {
    expect(findUnbuiltOptions(OPTION_CONFIG, null)).toEqual([]);
  });

  it('disabled uTLS and the system tun stack do not count as options', () => {
    const found = findUnbuiltOptions(OPTION_CONFIG, ['with_clash_api', 'with_v2ray_api']);

    expect(found.map((option) => option.path)).toEqual([
      'outbounds[0].tls.utls',
      'dns.servers[0].tls.utls',
      'inbounds[0].stack',
      'inbounds[1].stack',
    ]);
  });
});

describe('unbuiltOptionOf', () => {
  it('names the node option tag and everything under it when it is missing from the build', () => {
    expect(unbuiltOptionOf('tls.utls', ['with_quic'])).toBe('with_utls');
    expect(unbuiltOptionOf('tls.utls.fingerprint', ['with_quic'])).toBe('with_utls');
  });

  it('stays silent about an option from the build, about a field not in the table and about an unread binary', () => {
    expect(unbuiltOptionOf('tls.utls', ['with_utls'])).toBeNull();
    expect(unbuiltOptionOf('tls.server_name', [])).toBeNull();
    expect(unbuiltOptionOf('tls.utls', null)).toBeNull();
  });
});
