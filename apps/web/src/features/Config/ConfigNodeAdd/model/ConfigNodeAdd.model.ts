import { buildTagOfType, NODE_REGISTRY, nodeVariants, type NodeRegistry } from '@entities/Config';

/** Node type choice item. */
export interface NodeTypeOption {
  type: string;
  /**
   * Build tag that is not in the binary build: a node of such a type will be
   * saved, but `sing-box check` will reject it. `null` means the type will run
   * or the build contents were not read.
   */
  unbuilt: string | null;
  /** The type has a description line; `null` means a type of another registry or a new fork type. */
  described: DescribedNodeType | null;
}

/** What a node of the type does: the add form groups the type list by it. */
export const NODE_TYPE_GROUP = {
  Proxy: 'proxy',
  Group: 'group',
  Service: 'service',
  Router: 'router',
  Server: 'server',
  Other: 'other',
} as const;

export type NodeTypeGroup = (typeof NODE_TYPE_GROUP)[keyof typeof NODE_TYPE_GROUP];

/** Outbound types of the fork by group, checked against the fork protocols (`protocol/*`). */
const OUTBOUND_TYPE_GROUP = {
  anytls: NODE_TYPE_GROUP.Proxy,
  call: NODE_TYPE_GROUP.Proxy,
  http: NODE_TYPE_GROUP.Proxy,
  hysteria: NODE_TYPE_GROUP.Proxy,
  hysteria2: NODE_TYPE_GROUP.Proxy,
  masque: NODE_TYPE_GROUP.Proxy,
  mieru: NODE_TYPE_GROUP.Proxy,
  naive: NODE_TYPE_GROUP.Proxy,
  parser: NODE_TYPE_GROUP.Proxy,
  shadowsocks: NODE_TYPE_GROUP.Proxy,
  shadowtls: NODE_TYPE_GROUP.Proxy,
  snell: NODE_TYPE_GROUP.Proxy,
  socks: NODE_TYPE_GROUP.Proxy,
  ssh: NODE_TYPE_GROUP.Proxy,
  sudoku: NODE_TYPE_GROUP.Proxy,
  tor: NODE_TYPE_GROUP.Proxy,
  trojan: NODE_TYPE_GROUP.Proxy,
  trusttunnel: NODE_TYPE_GROUP.Proxy,
  tuic: NODE_TYPE_GROUP.Proxy,
  vless: NODE_TYPE_GROUP.Proxy,
  vmess: NODE_TYPE_GROUP.Proxy,
  selector: NODE_TYPE_GROUP.Group,
  urltest: NODE_TYPE_GROUP.Group,
  fallback: NODE_TYPE_GROUP.Group,
  failover: NODE_TYPE_GROUP.Group,
  bond: NODE_TYPE_GROUP.Group,
  direct: NODE_TYPE_GROUP.Service,
  bridge: NODE_TYPE_GROUP.Service,
  'bandwidth-limiter': NODE_TYPE_GROUP.Service,
  'connection-limiter': NODE_TYPE_GROUP.Service,
  'rate-limiter': NODE_TYPE_GROUP.Service,
  'traffic-limiter': NODE_TYPE_GROUP.Service,
} as const satisfies Readonly<Record<string, NodeTypeGroup>>;

/** Inbound types of the fork by group, checked against the fork protocols (`protocol/*`). */
const INBOUND_TYPE_GROUP = {
  tun: NODE_TYPE_GROUP.Router,
  mixed: NODE_TYPE_GROUP.Router,
  redirect: NODE_TYPE_GROUP.Router,
  tproxy: NODE_TYPE_GROUP.Router,
  anytls: NODE_TYPE_GROUP.Server,
  call: NODE_TYPE_GROUP.Server,
  http: NODE_TYPE_GROUP.Server,
  hysteria: NODE_TYPE_GROUP.Server,
  hysteria2: NODE_TYPE_GROUP.Server,
  mieru: NODE_TYPE_GROUP.Server,
  mtproxy: NODE_TYPE_GROUP.Server,
  naive: NODE_TYPE_GROUP.Server,
  shadowsocks: NODE_TYPE_GROUP.Server,
  shadowtls: NODE_TYPE_GROUP.Server,
  snell: NODE_TYPE_GROUP.Server,
  socks: NODE_TYPE_GROUP.Server,
  ssh: NODE_TYPE_GROUP.Server,
  sudoku: NODE_TYPE_GROUP.Server,
  trojan: NODE_TYPE_GROUP.Server,
  trusttunnel: NODE_TYPE_GROUP.Server,
  tuic: NODE_TYPE_GROUP.Server,
  vless: NODE_TYPE_GROUP.Server,
  vmess: NODE_TYPE_GROUP.Server,
  bond: NODE_TYPE_GROUP.Other,
  cloudflared: NODE_TYPE_GROUP.Other,
  direct: NODE_TYPE_GROUP.Other,
  failover: NODE_TYPE_GROUP.Other,
} as const satisfies Readonly<Record<string, NodeTypeGroup>>;

export type DescribedOutboundType = keyof typeof OUTBOUND_TYPE_GROUP;
export type DescribedInboundType = keyof typeof INBOUND_TYPE_GROUP;
export type DescribedNodeType =
  | { registry: typeof NODE_REGISTRY.Outbound; type: DescribedOutboundType }
  | { registry: typeof NODE_REGISTRY.Inbound; type: DescribedInboundType };

/** Groups of a registry in the order the list shows them, and the table that assigns a type to one. */
function isKeyOf<T extends object>(table: T, key: string): key is Extract<keyof T, string> {
  return Object.hasOwn(table, key);
}

const REGISTRY_GROUPS: Readonly<
  Partial<
    Record<
      NodeRegistry,
      { order: readonly NodeTypeGroup[]; types: Readonly<Record<string, NodeTypeGroup>>; fallback: NodeTypeGroup }
    >
  >
> = {
  [NODE_REGISTRY.Outbound]: {
    order: [NODE_TYPE_GROUP.Proxy, NODE_TYPE_GROUP.Group, NODE_TYPE_GROUP.Service],
    types: OUTBOUND_TYPE_GROUP,
    fallback: NODE_TYPE_GROUP.Service,
  },
  [NODE_REGISTRY.Inbound]: {
    order: [NODE_TYPE_GROUP.Router, NODE_TYPE_GROUP.Server, NODE_TYPE_GROUP.Other],
    types: INBOUND_TYPE_GROUP,
    fallback: NODE_TYPE_GROUP.Other,
  },
};

function describedType(registry: NodeRegistry, type: string): DescribedNodeType | null {
  if (registry === NODE_REGISTRY.Outbound && isKeyOf(OUTBOUND_TYPE_GROUP, type)) {
    return { registry, type };
  }

  if (registry === NODE_REGISTRY.Inbound && isKeyOf(INBOUND_TYPE_GROUP, type)) {
    return { registry, type };
  }

  return null;
}

const INBOUND_DOCS_ROOT = 'https://github.com/shtorm-7/sing-box-extended/blob/extended/docs/configuration/inbound';

/** Inbound types that have a page in the fork's `docs/configuration/inbound`. */
const INBOUND_DOCS_TYPES: ReadonlySet<string> = new Set([
  'anytls',
  'cloudflared',
  'direct',
  'http',
  'hysteria',
  'hysteria2',
  'mieru',
  'mixed',
  'naive',
  'redirect',
  'shadowsocks',
  'shadowtls',
  'snell',
  'socks',
  'tproxy',
  'trojan',
  'tuic',
  'tun',
  'vless',
  'vmess',
]);

/** The fork's documentation page of the type; `null` where the fork has none (outbounds, types the fork did not document). */
export function nodeTypeDocsUrl(registry: NodeRegistry, type: string): string | null {
  return registry === NODE_REGISTRY.Inbound && INBOUND_DOCS_TYPES.has(type) ? `${INBOUND_DOCS_ROOT}/${type}.md` : null;
}

/** Types of one group in the choice list; `group` is `null` for a registry without groups. */
export interface NodeTypeSection {
  group: NodeTypeGroup | null;
  options: NodeTypeOption[];
}

/**
 * Registry types for selection, by name. A type outside the binary build is not
 * disabled but marked (AC-47): a config is also built for another binary, and
 * the mark names the consequence. `builtTags` is `null` until the daemon has
 * read the binary: nothing is known about the build contents then, and there
 * are no marks.
 */
export function nodeTypeOptions(registry: NodeRegistry, builtTags: readonly string[] | null): NodeTypeOption[] {
  return nodeVariants(registry)
    .map(({ type }) => {
      const tag = buildTagOfType(registry, type);

      return {
        type,
        unbuilt: tag !== null && builtTags !== null && !builtTags.includes(tag) ? tag : null,
        described: describedType(registry, type),
      };
    })
    .sort((left, right) => left.type.localeCompare(right.type, 'en'));
}

/**
 * Outbound and inbound types grouped by what they do: a newcomer looks for a
 * proxy protocol (outbound) or for what a home router needs (inbound) and does
 * not have to tell them from the rest by name. A fork type without an entry goes
 * to the last group of its registry: it is still choosable. Other registries are
 * one ungrouped list.
 */
export function nodeTypeSections(options: readonly NodeTypeOption[], registry: NodeRegistry): NodeTypeSection[] {
  const groups = REGISTRY_GROUPS[registry];

  if (groups === undefined) {
    return [{ group: null, options: [...options] }];
  }

  return groups.order
    .map((group) => ({
      group,
      options: options.filter(
        (option) => (option.described === null ? groups.fallback : groups.types[option.described.type]) === group
      ),
    }))
    .filter((section) => section.options.length > 0);
}
