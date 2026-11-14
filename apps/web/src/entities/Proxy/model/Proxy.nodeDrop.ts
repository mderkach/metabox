import type { ProviderUpdate, ProxyProvider } from './Proxy.model';

/**
 * How a subscription update changed its node set. The fork replaces the whole
 * set and its cache when an update brings one node or when the filters leave
 * none; only an empty or unreadable answer keeps the previous set. The panel
 * cannot prevent that, it can only point at it.
 */
export const NODE_DROP = {
  None: 'none',
  /** A few nodes left out of many: the server likely answered with a placeholder. */
  Collapsed: 'collapsed',
  /** No nodes at all: groups get nothing from the subscription. */
  Empty: 'empty',
} as const;

export type NodeDrop = (typeof NODE_DROP)[keyof typeof NODE_DROP];

/**
 * At most this many nodes after an update look like a placeholder answer
 * ("subscription expired", an error page parsed as a node), not a real list.
 */
const COLLAPSED_AT_MOST = 2;

/**
 * The set must also have shrunk at least this many times. Tachyon keeps its
 * cache when six or more nodes become two or fewer; the ratio draws the same
 * line for small subscriptions (3 → 1) and stays quiet on 2 → 1 or 40 → 12,
 * where a provider plausibly changed its list.
 */
const COLLAPSE_RATIO = 3;

export function toNodeDrop(before: number | null, after: number): NodeDrop {
  if (after === 0) {
    return NODE_DROP.Empty;
  }

  if (before !== null && after <= COLLAPSED_AT_MOST && before >= after * COLLAPSE_RATIO) {
    return NODE_DROP.Collapsed;
  }

  return NODE_DROP.None;
}

/** What the panel last saw of a subscription. */
export interface ProviderSeen {
  nodes: number;
  /** The runtime update time as served; an empty string for a never loaded subscription. */
  updatedAt: string;
  /** Node count before the last update the panel saw; `null` until it sees one. */
  previous: number | null;
}

export type ProvidersSeen = Readonly<Record<string, ProviderSeen>>;

export interface ProviderNodeChange {
  /** `null` when the panel has not seen an update of this subscription yet. */
  before: number | null;
  after: number;
  drop: NodeDrop;
}

function toUpdatedAt(update: ProviderUpdate): string {
  return update.kind === 'never' ? '' : update.raw;
}

/**
 * The record after one more look at the subscriptions. A new update time or a
 * new node count is an update: the count seen so far becomes `previous`. The
 * same reference comes back when nothing changed, so a caller can tell a write
 * is not needed. Subscriptions gone from the list are forgotten.
 */
export function observeProviders(seen: ProvidersSeen, providers: readonly ProxyProvider[]): ProvidersSeen {
  let changed = Object.keys(seen).length !== providers.length;
  const next: Record<string, ProviderSeen> = {};

  for (const provider of providers) {
    const updatedAt = toUpdatedAt(provider.update);
    const known = Object.hasOwn(seen, provider.name) ? seen[provider.name] : undefined;

    if (known === undefined) {
      next[provider.name] = { nodes: provider.nodes, updatedAt, previous: null };
      changed = true;
    } else if (known.updatedAt === updatedAt && known.nodes === provider.nodes) {
      next[provider.name] = known;
    } else {
      next[provider.name] = { nodes: provider.nodes, updatedAt, previous: known.nodes };
      changed = true;
    }
  }

  return changed ? next : seen;
}

export function toProviderNodeChange(seen: ProviderSeen | undefined, nodes: number): ProviderNodeChange {
  const before = seen?.previous ?? null;

  return { before, after: nodes, drop: toNodeDrop(before, nodes) };
}
