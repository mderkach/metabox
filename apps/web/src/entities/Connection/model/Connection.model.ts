export interface ConnectionRow {
  id: string;
  /** Host with port; when sniff did not resolve a name, the address remains. */
  host: string;
  network: string;
  source: string;
  /** Conditions of the matched rule: empty for an unconditional rule. */
  rule: string;
  /** Rule action in sing-box words: `route(proxy)`, `hijack-dns`, `sniff`. */
  action: string;
  /** Packet fate parsed from the action and the chain: the row is filtered and colored by it. */
  kind: RouteKind;
  /** Chain in human reading order: group → node. */
  chain: string[];
  upload: number;
  download: number;
  /**
   * Speed over the last snapshot interval, bytes per second. Computed by the
   * panel: the runtime serves only accumulated counters, and the question "who
   * is eating the channel now" cannot be answered from them.
   */
  downRate: number;
  upRate: number;
  startedAt: number;
  /** Host, source, rule, outbound and chain in one string: the screen searches by it. */
  searchText: string;
}

/** Bytes per second over the interval between two snapshots. */
export interface ConnectionRate {
  down: number;
  up: number;
}

export interface ConnectionTotals {
  upload: number;
  download: number;
  memory: number;
}

/** Action for a connection that matched no rule: the `route.final` node. */
export const FINAL_ACTION = 'route.final';

/**
 * Packet fate. The runtime serves the action as a string (`route(direct)`,
 * `hijack-dns`, `sniff`), and a new node kind is added as an entry in the table
 * below, not as a condition branch.
 */
export const ROUTE_KIND = {
  Direct: 'direct',
  Proxy: 'proxy',
  Block: 'block',
  Dns: 'dns',
  Other: 'other',
} as const;

export type RouteKind = (typeof ROUTE_KIND)[keyof typeof ROUTE_KIND];

/** Order matters: the check goes to the first match, `block` comes before the general `route(`. */
const ACTION_KINDS: readonly { match: string; kind: RouteKind }[] = [
  { match: 'direct', kind: ROUTE_KIND.Direct },
  { match: 'block', kind: ROUTE_KIND.Block },
  { match: 'reject', kind: ROUTE_KIND.Block },
  { match: 'dns', kind: ROUTE_KIND.Dns },
  { match: 'route(', kind: ROUTE_KIND.Proxy },
];

/** Chain node meaning an exit outward without a proxy. */
const DIRECT_NODE = 'direct';

/**
 * Outbound types that have their own tone. The rest, selectors, latency probes
 * and all proxy protocols from `OutboundSchema` (`@shared/api/generated`),
 * carry traffic through the node, so an unfamiliar type gets the proxy tone,
 * and there is no protocol list here: a copy would drift from the fork schema.
 *
 * The fork no longer accepts `block` and `dns` as outbounds, their place was
 * taken by rule actions, but they occur in a config from the device, and the
 * type map is built from document nodes, not from the schema.
 */
const OUTBOUND_TYPE_KIND: Readonly<Record<string, RouteKind>> = {
  direct: ROUTE_KIND.Direct,
  block: ROUTE_KIND.Block,
  dns: ROUTE_KIND.Dns,
};

/** Route action with an outbound tag: `route(proxy)`, but not `route-options(...)`. */
const ROUTE_ACTION = /^route\((.+)\)$/;

/** The type map has not arrived yet: parsing falls back to a substring table. */
export const EMPTY_OUTBOUND_TYPES: ReadonlyMap<string, string> = new Map();

/**
 * Packet fate by the type of the outbound with this tag; `null` means the tag
 * is not in the config, the type is unknown, and the consumer's fallback
 * substring table decides.
 */
export function toOutboundKind(tag: string | undefined, outboundTypes: ReadonlyMap<string, string>): RouteKind | null {
  if (tag === undefined) {
    return null;
  }

  const type = outboundTypes.get(tag);

  return type === undefined ? null : (OUTBOUND_TYPE_KIND[type] ?? ROUTE_KIND.Proxy);
}

/**
 * Connection action.
 *
 * The outbound type is primary: the tag from `route(<tag>)` or from the chain
 * is looked up in `outboundTypes`, and `direct-ru` of type `vless` gets the
 * proxy tone. The fallback is a substring table over the action string itself:
 * a subscription provider node is not in `outbounds`, and the panel will have
 * no type for it.
 *
 * `route.final` has no conditions and the action is not read from the string
 * there: the fate is shown by the chain, which is observable the same way as a
 * rule.
 */
export function toRouteKind(
  action: string,
  chain: readonly string[] = [],
  outboundTypes: ReadonlyMap<string, string> = EMPTY_OUTBOUND_TYPES
): RouteKind {
  const typed = toOutboundKind(ROUTE_ACTION.exec(action)?.[1], outboundTypes);

  if (typed !== null) {
    return typed;
  }

  // The chain is read from group to node: the group is declared in the config,
  // and the final node often comes from a subscription that is not in the
  // document.
  if (action === FINAL_ACTION) {
    for (const node of chain) {
      const kind = toOutboundKind(node, outboundTypes);

      if (kind !== null) {
        return kind;
      }
    }
  }

  const lower = action.toLowerCase();
  const matched = ACTION_KINDS.find((entry) => lower.includes(entry.match));

  if (matched !== undefined) {
    return matched.kind;
  }

  if (action !== FINAL_ACTION || chain.length === 0) {
    return ROUTE_KIND.Other;
  }

  return chain.includes(DIRECT_NODE) ? ROUTE_KIND.Direct : ROUTE_KIND.Proxy;
}

/** Summary share: how many connections and how much channel they account for. */
export interface ConnectionShare<Key extends string = string> {
  /** Group key: an action, a network type, a chain node or a device address. */
  key: Key;
  count: number;
  /** Bytes per second, incoming and outgoing together. */
  rate: number;
  /** Accumulated group bytes, incoming and outgoing together. */
  volume: number;
}

/** Live snapshot summary: what panels show instead of the list. */
export interface ConnectionSummary {
  actions: ConnectionShare<RouteKind>[];
  networks: ConnectionShare[];
  /** Final chain nodes that transferred the most first. */
  nodes: ConnectionShare[];
  /** Local network devices that transferred the most first. */
  sources: ConnectionShare[];
}

export const EMPTY_SUMMARY: ConnectionSummary = { actions: [], networks: [], nodes: [], sources: [] };

/** How many groups the bar summary shows: beyond that is a tail of ones. */
export const TOP_LIMIT = 5;

/** How many closed connections we keep: the Clash API does not serve the closed list. */
export const CLOSED_LIMIT = 200;
