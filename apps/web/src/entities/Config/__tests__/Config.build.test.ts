import { describe, expect, it } from 'vitest';

import { findUnbuiltNodes } from '../model/Config.build';
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
  it('находит узлы, чей тип закрыт тегом, которого нет в сборке', () => {
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

  it('проверяет и вложенную секцию DNS', () => {
    const found = findUnbuiltNodes(CONFIG, ['with_ccm']);

    expect(found.map((node) => `${node.section}[${String(node.index)}] ${node.type}`)).toEqual([
      'outbounds[1] hysteria2',
      'dns.servers[0] quic',
    ]);
  });

  it('молчит, когда состав сборки не прочитан', () => {
    expect(findUnbuiltNodes(CONFIG, null)).toEqual([]);
  });

  it('считает сборку без тегов сборкой без закрытых типов', () => {
    expect(findUnbuiltNodes(CONFIG, [])).toHaveLength(3);
  });
});
