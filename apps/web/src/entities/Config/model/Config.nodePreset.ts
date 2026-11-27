import { newSectionNode, NODE_REGISTRY, type NodeRegistry } from './Config.registry';

const API_SECRET_BYTES = 24;

/** A unique secret keeps a newly added service from accepting unauthenticated gRPC requests. */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(API_SECRET_BYTES));

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** Builds a new node with the defaults needed by its protocol. */
export function nodePreset(registry: NodeRegistry, type: string, tag: string): Record<string, unknown> {
  const node = newSectionNode(type, tag);

  if (registry === NODE_REGISTRY.Outbound && type === 'vless') {
    return {
      ...node,
      tls: { enabled: true, utls: { enabled: true, fingerprint: 'chrome' }, reality: { enabled: true } },
    };
  }

  if (registry === NODE_REGISTRY.Service && type === 'api') {
    return { ...node, listen: '127.0.0.1', secret: randomSecret() };
  }

  return node;
}
