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
  described: DescribedOutboundType | null;
}

/** What an outbound of the type does: the add form groups the type list by it. */
export const NODE_TYPE_GROUP = {
  Proxy: 'proxy',
  Group: 'group',
  Service: 'service',
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

export type DescribedOutboundType = keyof typeof OUTBOUND_TYPE_GROUP;

function isDescribedOutboundType(type: string): type is DescribedOutboundType {
  return Object.hasOwn(OUTBOUND_TYPE_GROUP, type);
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
        described: registry === NODE_REGISTRY.Outbound && isDescribedOutboundType(type) ? type : null,
      };
    })
    .sort((left, right) => left.type.localeCompare(right.type, 'en'));
}

/**
 * Outbound types grouped by what they do: a newcomer looks for a proxy protocol
 * and does not have to tell it from a limiter by name. A fork type without an
 * entry goes to the service group: it is still choosable. Other registries are
 * one ungrouped list.
 */
export function nodeTypeSections(options: readonly NodeTypeOption[], registry: NodeRegistry): NodeTypeSection[] {
  if (registry !== NODE_REGISTRY.Outbound) {
    return [{ group: null, options: [...options] }];
  }

  return Object.values(NODE_TYPE_GROUP)
    .map((group) => ({
      group,
      options: options.filter(
        (option) =>
          (option.described === null ? NODE_TYPE_GROUP.Service : OUTBOUND_TYPE_GROUP[option.described]) === group
      ),
    }))
    .filter((section) => section.options.length > 0);
}
