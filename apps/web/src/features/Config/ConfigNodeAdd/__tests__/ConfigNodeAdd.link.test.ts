import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { NODE_REGISTRY, nodeSchemaOf } from '@entities/Config';

import {
  NODE_LINK_ERROR,
  parseShareLink,
  shareLinkNode,
  shareLinkTag,
  type ShareLink,
} from '../model/ConfigNodeAdd.link';

const UUID = 'b831381d-6324-4d53-ad4f-8cda48b30811';
const REALITY_KEY = 'jNXHt1yRo0vDuchQlIP6Z0ZvjT3KtzVI-T4E7RoLJS0';

function toBase64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

function linkOf(text: string): ShareLink {
  const { link, error } = parseShareLink(text);

  expect(error).toBeNull();

  if (link === null) {
    throw new Error(`[TEST] link not parsed: ${text}`);
  }

  return link;
}

/** The node as it goes into the document, checked by the generated schema of its type. */
function nodeOf(text: string): Record<string, unknown> {
  const link = linkOf(text);
  const node = shareLinkNode(link, 'proxy');
  const schema = nodeSchemaOf(NODE_REGISTRY.Outbound, link.type);

  if (schema === null) {
    throw new Error(`[TEST] no schema for ${link.type}`);
  }

  expect(z.safeParse(schema, node).error?.issues).toBeUndefined();

  return node;
}

describe('parseShareLink', () => {
  it('reads VLESS with Reality, Vision and a uTLS fingerprint', () => {
    expect(
      nodeOf(
        `vless://${UUID}@203.0.113.7:443?encryption=none&flow=xtls-rprx-vision&security=reality` +
          `&sni=www.microsoft.com&fp=firefox&pbk=${REALITY_KEY}&sid=6ba85179e30d4fc2&type=tcp#Amsterdam`
      )
    ).toEqual({
      type: 'vless',
      tag: 'proxy',
      server: '203.0.113.7',
      server_port: 443,
      uuid: UUID,
      flow: 'xtls-rprx-vision',
      tls: {
        enabled: true,
        server_name: 'www.microsoft.com',
        utls: { enabled: true, fingerprint: 'firefox' },
        reality: { enabled: true, public_key: REALITY_KEY, short_id: '6ba85179e30d4fc2' },
      },
    });
  });

  it('turns uTLS on for Reality without a fingerprint: the fork client does not build Reality without it', () => {
    expect(nodeOf(`vless://${UUID}@example.com:443?security=reality&pbk=${REALITY_KEY}`).tls).toEqual({
      enabled: true,
      server_name: 'example.com',
      utls: { enabled: true, fingerprint: 'chrome' },
      reality: { enabled: true, public_key: REALITY_KEY },
    });
  });

  it('reads VLESS over WebSocket with early data in the path and a trailing slash before the query', () => {
    expect(
      nodeOf(
        `vless://${UUID}@example.com:8443/?type=ws&security=tls&host=cdn.example.com&path=%2Fws%3Fed%3D2048&alpn=h2,http/1.1`
      )
    ).toEqual({
      type: 'vless',
      tag: 'proxy',
      server: 'example.com',
      server_port: 8443,
      uuid: UUID,
      tls: { enabled: true, server_name: 'example.com', alpn: ['h2', 'http/1.1'] },
      transport: {
        type: 'ws',
        path: '/ws',
        headers: { Host: 'cdn.example.com' },
        max_early_data: 2048,
        early_data_header_name: 'Sec-WebSocket-Protocol',
      },
    });
  });

  it('reads gRPC, HTTPUpgrade and XHTTP transports', () => {
    expect(nodeOf(`vless://${UUID}@example.com:443?type=grpc&serviceName=tunnel&security=tls`).transport).toEqual({
      type: 'grpc',
      service_name: 'tunnel',
    });
    expect(nodeOf(`vless://${UUID}@example.com:443?type=httpupgrade&host=a.example&path=%2Fup`).transport).toEqual({
      type: 'httpupgrade',
      host: 'a.example',
      path: '/up',
    });
    expect(nodeOf(`vless://${UUID}@example.com:443?type=xhttp&path=%2Fx&mode=auto`).transport).toEqual({
      type: 'xhttp',
      path: '/x',
      mode: 'auto',
    });
  });

  it('reads an IPv6 server in brackets', () => {
    expect(nodeOf(`vless://${UUID}@[2001:db8::1]:443`)).toEqual({
      type: 'vless',
      tag: 'proxy',
      server: '2001:db8::1',
      server_port: 443,
      uuid: UUID,
    });
  });

  it('reads VMess from base64 JSON with a port as a string and TLS over WebSocket', () => {
    const json = {
      v: '2',
      ps: 'Франкфурт',
      add: 'vm.example.com',
      port: '443',
      id: UUID,
      aid: 0,
      scy: 'auto',
      net: 'ws',
      type: 'none',
      host: 'vm.example.com',
      path: '/vm',
      tls: 'tls',
      sni: 'vm.example.com',
    };
    const link = linkOf(`vmess://${toBase64(JSON.stringify(json))}`);

    expect(link.name).toBe('Франкфурт');
    expect(nodeOf(`vmess://${toBase64(JSON.stringify(json))}`)).toEqual({
      type: 'vmess',
      tag: 'proxy',
      server: 'vm.example.com',
      server_port: 443,
      uuid: UUID,
      tls: { enabled: true, server_name: 'vm.example.com' },
      transport: { type: 'ws', path: '/vm', headers: { Host: 'vm.example.com' } },
    });
  });

  it('keeps the VMess cipher and alter ID when the link sets them, and reads URL-safe base64 without padding', () => {
    const json = JSON.stringify({ add: '198.51.100.2', port: 10_086, id: UUID, aid: '64', scy: 'aes-128-gcm' });
    const body = toBase64(json).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

    expect(nodeOf(`vmess://${body}`)).toEqual({
      type: 'vmess',
      tag: 'proxy',
      server: '198.51.100.2',
      server_port: 10_086,
      uuid: UUID,
      security: 'aes-128-gcm',
      alter_id: 64,
    });
  });

  it('reads Trojan with TLS on by default and a percent-encoded password', () => {
    expect(
      nodeOf('trojan://p%40ss%3Aword@tr.example.com:443?sni=front.example.com&allowInsecure=1#Trojan%20RU')
    ).toEqual({
      type: 'trojan',
      tag: 'proxy',
      server: 'tr.example.com',
      server_port: 443,
      password: 'p@ss:word',
      tls: { enabled: true, server_name: 'front.example.com', insecure: true },
    });
    expect(linkOf('trojan://secret@tr.example.com:443#Trojan%20RU').name).toBe('Trojan RU');
  });

  it('reads Shadowsocks SIP002 with base64 user info and a plugin', () => {
    expect(
      nodeOf(
        `ss://${toBase64('chacha20-ietf-poly1305:pa:ss')}@ss.example.com:8388/?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Dexample.com#SS`
      )
    ).toEqual({
      type: 'shadowsocks',
      tag: 'proxy',
      server: 'ss.example.com',
      server_port: 8388,
      method: 'chacha20-ietf-poly1305',
      password: 'pa:ss',
      plugin: 'obfs-local',
      plugin_opts: 'obfs=http;obfs-host=example.com',
    });
  });

  it('reads Shadowsocks 2022 with plain percent-encoded user info', () => {
    expect(nodeOf('ss://2022-blake3-aes-128-gcm:YWJjZGVmZ2hpamtsbW5vcA%3D%3D@ss.example.com:443')).toMatchObject({
      method: '2022-blake3-aes-128-gcm',
      password: 'YWJjZGVmZ2hpamtsbW5vcA==',
    });
  });

  it('reads the legacy Shadowsocks form with the whole address in base64', () => {
    const link = linkOf(`ss://${toBase64('aes-256-gcm:secret@198.51.100.9:8388')}#Legacy`);

    expect(link.name).toBe('Legacy');
    expect(nodeOf(`ss://${toBase64('aes-256-gcm:secret@198.51.100.9:8388')}`)).toEqual({
      type: 'shadowsocks',
      tag: 'proxy',
      server: '198.51.100.9',
      server_port: 8388,
      method: 'aes-256-gcm',
      password: 'secret',
    });
  });

  it('reads Hysteria 2 under both schemes with obfuscation and bandwidth', () => {
    const node = {
      type: 'hysteria2',
      tag: 'proxy',
      server: 'hy.example.com',
      server_port: 8443,
      password: 'letmein',
      up_mbps: 50,
      down_mbps: 200,
      obfs: { type: 'salamander', password: 'cry' },
      tls: { enabled: true, server_name: 'real.example.com', insecure: true },
    };
    const query = 'obfs=salamander&obfs-password=cry&sni=real.example.com&insecure=1&up=50&down=200';

    expect(nodeOf(`hysteria2://letmein@hy.example.com:8443/?${query}#HY`)).toEqual(node);
    expect(nodeOf(`HY2://letmein@hy.example.com:8443?${query}`)).toEqual(node);
  });

  it('takes port 443 for Hysteria 2 without a port', () => {
    expect(nodeOf('hy2://letmein@hy.example.com')).toMatchObject({ server_port: 443 });
  });

  it('ignores spaces and a line break around the link', () => {
    expect(linkOf(`  vless://${UUID}@example.com:443\n`).server).toBe('example.com');
  });

  it.each([
    ['an empty string', ''],
    ['text without a scheme', 'example.com:443'],
    ['an unsupported scheme', 'tuic://uuid:pass@example.com:443'],
    ['a subscription address', 'https://provider.example/sub/token'],
  ])('rejects %s as an unknown scheme', (_case, text) => {
    expect(parseShareLink(text)).toEqual({ link: null, error: NODE_LINK_ERROR.Scheme });
  });

  it.each([
    ['VLESS without a port', `vless://${UUID}@example.com`],
    ['VLESS with a port out of range', `vless://${UUID}@example.com:70000`],
    ['VLESS with a port that is not a number', `vless://${UUID}@example.com:https`],
    ['Trojan without a host', 'trojan://secret@:443'],
    ['VMess without an address', `vmess://${toBase64(JSON.stringify({ port: 443, id: UUID }))}`],
    ['Hysteria 2 with a port-hopping range', 'hy2://pass@example.com:20000-30000'],
  ])('rejects %s as a missing server', (_case, text) => {
    expect(parseShareLink(text).error).toBe(NODE_LINK_ERROR.Server);
  });

  it.each([
    ['VLESS without a UUID', 'vless://example.com:443'],
    ['Trojan with an empty password', 'trojan://@example.com:443'],
    ['VMess without an ID', `vmess://${toBase64(JSON.stringify({ add: 'example.com', port: 443 }))}`],
    ['Shadowsocks without a password', `ss://${toBase64('aes-256-gcm')}@example.com:8388`],
    ['Shadowsocks with user info that is not base64', 'ss://bm90IGJhc2U2NA@example.com:8388'],
  ])('rejects %s as a missing credential', (_case, text) => {
    expect(parseShareLink(text).error).toBe(NODE_LINK_ERROR.Credential);
  });

  it.each([
    ['VMess that is not base64', 'vmess://not base64!'],
    ['VMess with base64 of not JSON', `vmess://${toBase64('hello')}`],
    ['VMess with a JSON array', `vmess://${toBase64('[]')}`],
    ['an unclosed IPv6 address', `vless://${UUID}@[2001:db8::1:443`],
    ['a broken percent sequence in user info', 'trojan://%E0%A4%A@example.com:443'],
  ])('rejects %s as malformed', (_case, text) => {
    expect(parseShareLink(text).error).toBe(NODE_LINK_ERROR.Malformed);
  });

  it('rejects a transport the fork does not have', () => {
    expect(parseShareLink(`vless://${UUID}@example.com:443?type=kcp`).error).toBe(NODE_LINK_ERROR.Transport);
  });
});

describe('shareLinkTag', () => {
  const link: ShareLink = { type: 'vless', name: '', server: 'example.com', fields: {} };

  it('takes the link name', () => {
    expect(shareLinkTag({ ...link, name: 'Amsterdam' }, [])).toBe('Amsterdam');
  });

  it('builds a name from the type and the server when the link has none', () => {
    expect(shareLinkTag(link, [])).toBe('vless-example.com');
  });

  it('numbers a taken name', () => {
    expect(shareLinkTag({ ...link, name: 'proxy' }, ['proxy', 'proxy-2'])).toBe('proxy-3');
  });
});
