import { z } from 'zod';

import { type ConfigDocument, parseConfig } from '@entities/Config';
import { isRecord } from '@shared/lib/isRecord';

const IPV4 = z.ipv4();
const MAX_PORT = 65_535;
const PORT = z.int().min(1).max(MAX_PORT);

export function onlyKeys(node: object, ...keys: string[]): boolean {
  return Object.keys(node).every((key) => keys.includes(key));
}

export function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];

  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string') ? value : [];
}

function tagged<T extends { tag?: string }>(nodes: readonly T[], tag: string) {
  return nodes.filter((node, index) => (node.tag === undefined || node.tag === '' ? String(index) : node.tag) === tag);
}

function isSocks(node: unknown): boolean {
  return (
    isRecord(node) &&
    node.type === 'socks' &&
    onlyKeys(node, 'type', 'tag', 'version', 'server', 'server_port') &&
    (node.version === undefined || node.version === '5') &&
    IPV4.safeParse(node.server).success &&
    PORT.safeParse(node.server_port).success
  );
}

export function eligibleExit(config: ConfigDocument, tag: string) {
  const outbounds = config.outbounds ?? [];
  const unique = (name: string) => {
    const matches = tagged(outbounds, name);
    return matches.length === 1 && tagged(config.endpoints ?? [], name).length === 0 && matches[0].tag === name
      ? matches[0]
      : undefined;
  };
  const exit = unique(tag);
  if (!exit || !tag) return undefined;
  if (exit.type === 'direct' && onlyKeys(exit, 'type', 'tag')) return exit;
  if (isSocks(exit)) return exit;
  if (exit.type !== 'selector' || !onlyKeys(exit, 'type', 'tag', 'outbounds', 'default')) return undefined;

  const members = strings(exit.outbounds);
  return members.length > 0 &&
    (exit.default === undefined || exit.default === '' || members.includes(exit.default)) &&
    members.every((member) => member !== tag && isSocks(unique(member)))
    ? exit
    : undefined;
}

export function eligibleResolvers(config: ConfigDocument, outbound: string): string[] {
  const exit = eligibleExit(config, outbound);
  const servers = config.dns?.servers ?? [];
  if (!exit) return [];

  return servers.flatMap((node) =>
    node.type === 'tcp' &&
    node.tag !== undefined &&
    node.tag !== '' &&
    tagged(servers, node.tag).length === 1 &&
    onlyKeys(node, 'type', 'tag', 'server', 'server_port', 'detour') &&
    IPV4.safeParse(node.server).success &&
    (node.server_port === undefined || PORT.safeParse(node.server_port).success) &&
    (node.detour === outbound || (exit.type === 'direct' && node.detour === undefined))
      ? [node.tag]
      : []
  );
}

export function getCatalogResolvers(text: string, outbound: string): string[] {
  const { config } = parseConfig(text);
  return config === null ? [] : eligibleResolvers(config, outbound);
}

export function hasCatalogIngress(config: ConfigDocument): boolean {
  const first: unknown = config.route?.rules?.at(0);
  if (!isRecord(first) || first.action !== 'hijack-dns' || !onlyKeys(first, 'inbound', 'action')) return false;

  const inbounds = config.inbounds ?? [];
  const inputs = strings(first.inbound);
  const data = inbounds.filter((node) => node.type === 'socks' || node.type === 'mixed');
  return (
    data.length > 0 &&
    inputs.length > 0 &&
    inputs.every((tag) => tagged(inbounds, tag).some((node) => node.type === 'direct')) &&
    inbounds.every((node) => {
      if (
        node.tag === undefined ||
        node.tag === '' ||
        tagged(inbounds, node.tag).length !== 1 ||
        !('listen_port' in node) ||
        !PORT.safeParse(node.listen_port).success
      )
        return false;
      if (node.type === 'direct') {
        return (
          inputs.includes(node.tag) &&
          (node.network === undefined || strings(node.network).includes('udp')) &&
          onlyKeys(node, 'type', 'tag', 'listen', 'listen_port', 'network')
        );
      }
      return (
        (node.type === 'socks' || node.type === 'mixed') &&
        onlyKeys(node, 'type', 'tag', 'listen', 'listen_port', 'users')
      );
    })
  );
}
