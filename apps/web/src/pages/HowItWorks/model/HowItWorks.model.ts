import { ROUTE_KIND, type ConnectionRow } from '@entities/Connection';
import { deviceLabel, EMPTY_DEVICE_INDEX, type DeviceIndex } from '@entities/Device';
import { GROUP_TYPES, type ProxyGroup, type ProxyProvider } from '@entities/Proxy';
import { ROUTE_MATCH, type RouteExplanation, type RouteMatch, type RouteOrigin } from '@entities/Route';

export const WALK_KIND = {
  Group: 'group',
  Server: 'server',
  Direct: 'direct',
} as const;

export const WALK_KINDS = [WALK_KIND.Group, WALK_KIND.Server, WALK_KIND.Direct] as const;

export type WalkKind = (typeof WALK_KINDS)[number];

/** Each list starts with the offered connection, followed by its same-kind replacements. */
export type WalkCandidates = Record<WalkKind, ConnectionRow[]>;

export interface VerifiedWalkRule {
  /** Position in the rule list of the loaded revision, counting from zero. */
  position: number;
  label: string;
  services: readonly string[];
  /** Provided only when the current editor document is also confirmed. */
  editorPosition?: number;
}

export interface WalkGroup {
  tag: string;
  type: string | null;
  picked: string | null;
  group: WalkGroup | null;
}

export interface ConnectionWalk {
  device: { address: string; label: string };
  destination: { host: string };
  rule: Omit<RouteMatch, 'index'> & { verified: VerifiedWalkRule | null };
  outbound: {
    origin: RouteOrigin;
    kind: WalkKind | 'unknown';
    tag: string | null;
    group: WalkGroup | null;
  };
  server: {
    origin: RouteOrigin;
    kind: 'none' | 'server' | 'unknown';
    tag: string | null;
    provider: string | null;
  };
}

interface WalkInput {
  row: ConnectionRow;
  explanation: RouteExplanation;
  devices?: DeviceIndex;
  groups?: readonly ProxyGroup[];
  providers?: readonly ProxyProvider[];
  verifiedRule?: VerifiedWalkRule | null;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HOST_WITH_OPTIONAL_PORT = /^([^:[\]]+)(?::\d+)?$/;
const DIRECT_TAG = 'direct';

function hasHostName(destination: string): boolean {
  const host = HOST_WITH_OPTIONAL_PORT.exec(destination)?.[1];

  return host !== undefined && !IPV4.test(host);
}

function toWalkKind(row: ConnectionRow): WalkKind | null {
  if (row.kind === ROUTE_KIND.Direct) {
    return WALK_KIND.Direct;
  }

  if (row.kind !== ROUTE_KIND.Proxy || row.chain.length === 0) {
    return null;
  }

  return row.chain.length === 1 ? WALK_KIND.Server : WALK_KIND.Group;
}

export function pickWalkCandidates(rows: readonly ConnectionRow[]): WalkCandidates {
  const named: WalkCandidates = { group: [], server: [], direct: [] };
  const addresses: WalkCandidates = { group: [], server: [], direct: [] };

  for (const row of rows) {
    const kind = toWalkKind(row);

    if (kind !== null) {
      const candidates = hasHostName(row.host) ? named : addresses;
      candidates[kind].push(row);
    }
  }

  return {
    group: named.group.concat(addresses.group),
    server: named.server.concat(addresses.server),
    direct: named.direct.concat(addresses.direct),
  };
}

function toWalkGroup(chain: readonly string[], groups: readonly ProxyGroup[], index: number): WalkGroup | null {
  const group = groups.find(({ name }) => name === chain[index]);

  if (group === undefined) {
    return null;
  }

  const nextIndex = index + 1;

  return {
    tag: group.name,
    type: GROUP_TYPES.has(group.type) ? group.type : null,
    picked: chain[nextIndex] ?? null,
    group: toWalkGroup(chain, groups, nextIndex),
  };
}

function toOutboundStep(
  chain: readonly string[],
  origin: RouteOrigin,
  kind: ConnectionRow['kind'],
  groups: readonly ProxyGroup[]
): ConnectionWalk['outbound'] {
  const tag = chain[0] ?? null;
  const group = toWalkGroup(chain, groups, 0);

  if (group !== null) {
    return { origin, kind: WALK_KIND.Group, tag, group };
  }

  if (kind === ROUTE_KIND.Direct || tag === DIRECT_TAG) {
    return { origin, kind: WALK_KIND.Direct, tag, group };
  }

  const singleServer = kind === ROUTE_KIND.Proxy && chain.length === 1;

  return { origin, kind: singleServer ? WALK_KIND.Server : 'unknown', tag, group };
}

function toServerStep(
  chain: readonly string[],
  origin: RouteOrigin,
  kind: ConnectionRow['kind'],
  groups: readonly ProxyGroup[],
  providers: readonly ProxyProvider[]
): ConnectionWalk['server'] {
  const tag = chain.at(-1);

  if (kind === ROUTE_KIND.Direct || tag === DIRECT_TAG) {
    return { origin, kind: 'none', tag: null, provider: null };
  }

  if (tag === undefined || groups.some(({ name }) => name === tag)) {
    return { origin, kind: 'unknown', tag: null, provider: null };
  }

  const subscriptions = providers.filter(({ nodeNames }) => nodeNames.includes(tag));

  return { origin, kind: 'server', tag, provider: subscriptions.length === 1 ? subscriptions[0].name : null };
}

export function toConnectionWalk({
  row,
  explanation,
  devices = EMPTY_DEVICE_INDEX,
  groups = [],
  providers = [],
  verifiedRule = null,
}: WalkInput): ConnectionWalk {
  const { chain, match } = explanation;
  const nodes = [...chain.nodes].reverse();
  const { origin, kind, conditions, action, reasonCode, reason } = match;

  return {
    device: { address: row.source, label: deviceLabel(row.source, devices) },
    destination: { host: row.host },
    rule: {
      origin,
      kind,
      conditions,
      action,
      reasonCode,
      reason,
      verified: kind === ROUTE_MATCH.Rule ? verifiedRule : null,
    },
    outbound: toOutboundStep(nodes, chain.origin, row.kind, groups),
    server: toServerStep(nodes, chain.origin, row.kind, groups, providers),
  };
}
