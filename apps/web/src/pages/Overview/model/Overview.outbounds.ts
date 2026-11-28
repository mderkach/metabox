import { readRuleNames, readRules, toFinalOutbound, toOutboundTypes, type ConfigDocument } from '@entities/Config';
import { FINAL_ACTION, routeOutboundOf, type ConnectionRate, type ConnectionRow } from '@entities/Connection';
import type { SystemStat } from '@entities/Daemon';
import {
  GROUP_TYPES,
  isLatencyServer,
  toLatencyReading,
  type OutboundMetadataMap,
  type ProxyGroup,
  type ProxyNode,
  type ProxyRuntime,
  type ServerLatencies,
  type ServerLatency,
} from '@entities/Proxy';
import { ROUTE_ORIGIN } from '@entities/Route';
import { RULE_TARGET, toRuleRowsFromNodes, type RuleRow } from '@entities/Rule';

export const OUTBOUND_KIND = {
  Group: 'group',
  Direct: 'direct',
  Block: 'block',
  Dns: 'dns',
  Server: 'server',
  Unknown: 'unknown',
} as const;

export const GROUP_CHOICE = {
  Manual: 'manual',
  Latency: 'latency',
  FirstAvailable: 'firstAvailable',
  LoadBalance: 'loadBalance',
  Automatic: 'automatic',
} as const;

interface OutboundConfig {
  rules: ReadonlyMap<string, RuleRow[]>;
  types: ReadonlyMap<string, string>;
  final: string | null;
}

interface OutboundName {
  tag: string;
  label: string | undefined;
}

interface OutboundGroup extends OutboundName {
  choice: (typeof GROUP_CHOICE)[keyof typeof GROUP_CHOICE];
  count: number;
}

interface OutboundConnectionStats extends ConnectionRate {
  count: number;
}

export interface OutboundLatency {
  server: OutboundName;
  latency: ServerLatency | undefined;
  reading: ReturnType<typeof toLatencyReading>;
  automatedNorm: boolean;
}

type OutboundTraffic = Pick<NonNullable<SystemStat['outbounds']>[number], 'bytes' | 'rate' | 'origin'>;

export type OutboundRate =
  | { kind: 'directional'; down: number; up: number }
  | { kind: 'combined'; rate: number; origin: string }
  | { kind: 'idle' };

export interface OverviewOutbound {
  name: OutboundName;
  kind: (typeof OUTBOUND_KIND)[keyof typeof OUTBOUND_KIND];
  group: OutboundGroup | null;
  nested: OutboundGroup[];
  latency: OutboundLatency | null;
  rules: { id: string; caption: string; named: boolean }[];
  ruleCount: number;
  final: boolean;
  traffic: OutboundTraffic | null;
  rate: OutboundRate | null;
  connections: number | null;
}

const PREVIEW_RULES = 3;
const ROW_PRIORITY = { WithTraffic: 0, Final: 1, Idle: 2 } as const;
const NO_CONNECTIONS: OutboundConnectionStats = { count: 0, down: 0, up: 0 };
const NO_TRAFFIC = { bytes: 0, rate: 0, origin: ROUTE_ORIGIN.Observed };
const GROUP_CONFIG_TYPES = new Set(Array.from(GROUP_TYPES, (type) => type.toLowerCase()));
const RUNTIME_GROUP_CHOICE: Readonly<Record<string, OutboundGroup['choice']>> = {
  URLTest: GROUP_CHOICE.Latency,
  Fallback: GROUP_CHOICE.FirstAvailable,
  LoadBalance: GROUP_CHOICE.LoadBalance,
};

export function toOverviewOutboundConfig(text: string, config: ConfigDocument | null): OutboundConfig {
  const rules = new Map<string, RuleRow[]>();

  for (const rule of toRuleRowsFromNodes(readRules(text), readRuleNames(text))) {
    if (rule.targetKind !== RULE_TARGET.Outbound) continue;

    const group = rules.get(rule.target);
    if (group === undefined) rules.set(rule.target, [rule]);
    else group.push(rule);
  }

  return { rules, final: toFinalOutbound(config), types: toOutboundTypes(config) };
}

export function toOverviewOutboundConnections(connections: readonly ConnectionRow[]) {
  const byRule = new Map<string, OutboundConnectionStats>();
  const byFinal = new Map<string, OutboundConnectionStats>();

  for (const connection of connections) {
    const { action, chain, downRate, upRate } = connection;
    const tag = chain.at(0) ?? routeOutboundOf(action);
    if (tag === null) continue;

    const rows = action === FINAL_ACTION ? byFinal : byRule;
    const stats = rows.get(tag) ?? { ...NO_CONNECTIONS };

    stats.count += 1;
    stats.down += downRate;
    stats.up += upRate;
    rows.set(tag, stats);
  }

  return { byRule, byFinal };
}

function toGroupChoice(group: ProxyGroup): OutboundGroup['choice'] {
  if (group.selectable) return GROUP_CHOICE.Manual;

  return RUNTIME_GROUP_CHOICE[group.type] ?? GROUP_CHOICE.Automatic;
}

function toOutboundKind(type: string | undefined, group: boolean, server: boolean): OverviewOutbound['kind'] {
  if (group || (type !== undefined && GROUP_CONFIG_TYPES.has(type))) return OUTBOUND_KIND.Group;
  if (server) return OUTBOUND_KIND.Server;
  if (type === 'direct') return OUTBOUND_KIND.Direct;
  if (type === 'block' || type === 'reject') return OUTBOUND_KIND.Block;
  if (type === 'dns') return OUTBOUND_KIND.Dns;

  return type === undefined ? OUTBOUND_KIND.Unknown : OUTBOUND_KIND.Server;
}

function toOutboundRate(current: OutboundConnectionStats | null, traffic: OutboundTraffic | null): OutboundRate | null {
  if (current !== null && (current.down > 0 || current.up > 0)) {
    return { kind: 'directional', down: current.down, up: current.up };
  }

  // The daemon can see bytes from connections that opened and closed between panel snapshots.
  if (traffic !== null && traffic.rate > 0) return { kind: 'combined', rate: traffic.rate, origin: traffic.origin };

  return current !== null || traffic !== null ? { kind: 'idle' } : null;
}

export function toOverviewOutbounds({
  config,
  runtime,
  metadata,
  latencies,
  legacyNorm,
  traffic,
  connections,
  subject,
}: {
  config: OutboundConfig;
  runtime: ProxyRuntime | undefined;
  metadata: OutboundMetadataMap | undefined;
  latencies: ServerLatencies | undefined;
  legacyNorm: boolean;
  traffic: SystemStat['outbounds'];
  connections: ReturnType<typeof toOverviewOutboundConnections> | null;
  subject: (rule: RuleRow) => string;
}): OverviewOutbound[] {
  const groups = new Map(runtime?.groups.map((group) => [group.name, group]));
  const nodes = new Map(runtime?.standalone.map((node) => [node.name, node]));
  const volumes = new Map(traffic?.map((volume) => [volume.tag, volume]));

  function toName(tag: string): OutboundName {
    return { tag, label: metadata?.get(tag)?.label };
  }

  function toGroup(group: ProxyGroup): OutboundGroup {
    return { ...toName(group.name), choice: toGroupChoice(group), count: group.nodes.length };
  }

  function toServerLatency(node: ProxyNode): OutboundLatency {
    const latency = latencies?.get(node.name);
    const manualNorm = metadata?.get(node.name)?.normMs;
    const reading = toLatencyReading(latency, manualNorm, legacyNorm);

    return {
      server: toName(node.name),
      latency,
      reading,
      automatedNorm: manualNorm === undefined,
    };
  }

  function toRow(tag: string, final: boolean, rules: readonly RuleRow[]): OverviewOutbound {
    const group = groups.get(tag);
    const nested: OutboundGroup[] = [];
    const visited = new Set<string>([tag]);
    let terminal = group?.now ?? null;

    while (terminal !== null && !visited.has(terminal)) {
      visited.add(terminal);
      const chosen = groups.get(terminal);
      if (chosen === undefined) break;

      nested.push(toGroup(chosen));
      terminal = chosen.now;
    }

    const selected = group === undefined ? tag : terminal;
    const node = selected === null ? undefined : nodes.get(selected);
    const server = node !== undefined && isLatencyServer(node) ? node : null;
    const volume = volumes.get(tag);
    const value = (final ? volume?.final : volume) ?? (traffic === undefined ? null : NO_TRAFFIC);
    const current = final ? connections?.byFinal.get(tag) : connections?.byRule.get(tag);
    const active = connections === null ? null : (current ?? NO_CONNECTIONS);

    return {
      name: toName(tag),
      kind: toOutboundKind(
        config.types.get(tag) ?? nodes.get(tag)?.type.toLowerCase(),
        group !== undefined,
        server !== null
      ),
      group: group === undefined ? null : toGroup(group),
      nested,
      latency: server === null ? null : toServerLatency(server),
      rules: rules
        .slice(0, PREVIEW_RULES)
        .map((rule) => ({ id: rule.id, caption: subject(rule), named: rule.name !== null })),
      ruleCount: rules.length,
      final,
      traffic: value,
      rate: toOutboundRate(active, value),
      connections: active?.count ?? null,
    };
  }

  const rows = Array.from(config.rules, ([tag, rules]) => toRow(tag, false, rules));
  if (config.final !== null) rows.push(toRow(config.final, true, []));

  function rank(row: OverviewOutbound): number {
    if (row.final) return ROW_PRIORITY.Final;

    return (row.traffic?.bytes ?? 0) > 0 ? ROW_PRIORITY.WithTraffic : ROW_PRIORITY.Idle;
  }

  return rows.sort(
    (left, right) => rank(left) - rank(right) || (right.traffic?.bytes ?? 0) - (left.traffic?.bytes ?? 0)
  );
}
