import { z } from 'zod';

import type { ConfigDocument } from '@entities/Config';

const IP_ADDRESS = z.union([z.ipv4(), z.ipv6()]);

export function readProxyAccess(config: ConfigDocument) {
  const otherTypes = new Set<string>();
  const listeners = (config.inbounds ?? []).flatMap((node, index) => {
    if (node.type !== 'http' && node.type !== 'socks' && node.type !== 'mixed') {
      otherTypes.add(node.type);
      return [];
    }

    const host = IP_ADDRESS.safeParse(node.listen).data;
    const port = node.listen_port;
    const binding =
      host !== undefined && port !== undefined && port > 0
        ? `${host.includes(':') ? `[${host}]` : host}:${String(port)}`
        : null;

    return [
      {
        index,
        protocol: node.type,
        binding,
        wildcard: host !== undefined && (host === '0.0.0.0' || /^[0:]+$/u.test(host)),
        loopback: host !== undefined && (host.startsWith('127.') || /^[0:]*:0*1$/u.test(host)),
        bindInterface: node.bind_interface,
        hasAccounts: (node.users?.length ?? 0) > 0,
      },
    ];
  });

  return { listeners, otherTypes: [...otherTypes] };
}
