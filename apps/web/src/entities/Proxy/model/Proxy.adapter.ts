import { API_FAILURE, ApiError } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

import type {
  ClashProvidersWire,
  ClashProxiesWire,
  ClashProxyWire,
  ClashSubscriptionInfoWire,
} from '../api/Proxy.schema';
import {
  DELAY_FAST,
  DELAY_STATE,
  DELAY_TIMEOUT,
  GROUP_TYPES,
  SERVICE_GROUPS,
  type DelayState,
  type ProbeOutcome,
  type ProviderUpdate,
  type ProviderUsage,
  type ProxyGroup,
  type ProxyNode,
  type ProxyProvider,
  type ProxyRuntime,
} from './Proxy.model';

/** Selector type: the only group where the user picks the node. */
const SELECTOR_TYPE = 'Selector';

const SERVICE_UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;

/** Statuses the fork answers a probe with when the node did not respond in time or at all. */
const PROBE_FAILURE_STATUS: ReadonlySet<number> = new Set([SERVICE_UNAVAILABLE, GATEWAY_TIMEOUT]);

const NO_FAILED_PROBES: ReadonlySet<string> = new Set();

/**
 * The node did not answer the probe. The Clash API body has a message and no daemon
 * code: a daemon refusal with a code (sing-box is down) stays an error of the panel.
 */
export function isProbeFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === API_FAILURE.Response &&
    error.code === null &&
    error.status !== null &&
    PROBE_FAILURE_STATUS.has(error.status)
  );
}

/**
 * Nodes whose latest panel probe failed. Outcomes go in the order they were
 * started, so a later probe of the same node overrides an earlier one.
 */
export function toFailedProbes(outcomes: readonly ProbeOutcome[]): ReadonlySet<string> {
  const latest = new Map<string, boolean>();

  for (const outcome of outcomes) {
    latest.set(outcome.name, outcome.failed);
  }

  return new Set([...latest].filter(([, failed]) => failed).map(([name]) => name));
}

/**
 * A failed probe counts only while the history is empty: the fork deletes the history
 * on a failure, so an entry that appeared since is a newer measurement.
 */
function toDelay(proxy: ClashProxyWire, failed: ReadonlySet<string>): number | null {
  const last = proxy.history.at(-1);

  if (last !== undefined) {
    return last.delay;
  }

  return failed.has(proxy.name) ? DELAY_TIMEOUT : null;
}

function toDelayState(delay: number | null): DelayState {
  if (delay === null) {
    return DELAY_STATE.Unknown;
  }

  if (delay >= DELAY_TIMEOUT || delay === 0) {
    return DELAY_STATE.Failed;
  }

  return delay <= DELAY_FAST ? DELAY_STATE.Fast : DELAY_STATE.Slow;
}

function toNode(proxy: ClashProxyWire, selected: boolean, failed: ReadonlySet<string>): ProxyNode {
  const delay = toDelay(proxy, failed);

  return { name: proxy.name, type: proxy.type, delay, delayState: toDelayState(delay), selected };
}

/**
 * Config groups. The service `GLOBAL` and `DIRECT` are dropped: they are not in
 * the file, and switching `GLOBAL` would take all traffic past the routing
 * rules.
 *
 * Selectors go first: only in them is a node switched by hand, while the screen
 * merely observes the other groups. Within a kind the runtime order is kept.
 */
function toGroups(source: ClashProxiesWire, failed: ReadonlySet<string>): ProxyGroup[] {
  const groups: ProxyGroup[] = [];

  for (const proxy of Object.values(source.proxies)) {
    if (!GROUP_TYPES.has(proxy.type) || SERVICE_GROUPS.has(proxy.name)) {
      continue;
    }

    const now = proxy.now ?? null;
    const nodes: ProxyNode[] = [];

    for (const name of proxy.all ?? []) {
      // The group lists a node that is not in the snapshot: the runtime serves
      // `all` from the config, and the node may have come from a subscription
      // and not loaded yet.
      if (!Object.hasOwn(source.proxies, name)) {
        continue;
      }

      const node = source.proxies[name];

      nodes.push(toNode(node, node.name === now, failed));
    }

    groups.push({
      name: proxy.name,
      type: proxy.type,
      selectable: proxy.type === SELECTOR_TYPE,
      now,
      nodes,
    });
  }

  return [...groups.filter((group) => group.selectable), ...groups.filter((group) => !group.selectable)];
}

/**
 * Nodes outside groups are what the screen shows when the config has no groups
 * at all: rules refer directly to outbounds, and there is nothing to switch.
 */
function toStandalone(source: ClashProxiesWire, failed: ReadonlySet<string>): ProxyNode[] {
  return Object.values(source.proxies)
    .filter((proxy) => !GROUP_TYPES.has(proxy.type) && !SERVICE_GROUPS.has(proxy.name))
    .map((proxy) => toNode(proxy, false, failed));
}

/**
 * Runtime snapshot with another node selected in a group. An unknown group
 * returns the snapshot as is: a selection in a nonexistent group is not a data
 * error but a race with rereading the list.
 */
export function withSelectedNode(proxies: ClashProxiesWire, group: string, node: string): ClashProxiesWire {
  if (!Object.hasOwn(proxies.proxies, group)) {
    return proxies;
  }

  return { proxies: { ...proxies.proxies, [group]: { ...proxies.proxies[group], now: node } } };
}

/** `failed` holds the nodes whose latest panel probe failed (`toFailedProbes`). */
export function toProxyRuntime(wire: ClashProxiesWire, failed: ReadonlySet<string> = NO_FAILED_PROBES): ProxyRuntime {
  return { groups: toGroups(wire, failed), standalone: toStandalone(wire, failed) };
}

function toProviderUpdate(raw: string): ProviderUpdate {
  const at = new Date(raw);

  if (Number.isNaN(at.getTime())) {
    return { kind: 'unknown', raw };
  }

  return at.getTime() <= 0 ? { kind: 'never' } : { kind: 'at', at, raw };
}

function toProviderUsage(info: ClashSubscriptionInfoWire | undefined): ProviderUsage | null {
  if (info === undefined) {
    return null;
  }

  const used = info.Upload + info.Download;

  return used === 0 && info.Total === 0 ? null : { used, total: info.Total };
}

export function toProxyProviders(wire: ClashProvidersWire): ProxyProvider[] {
  return Object.values(wire.providers).map((provider) => {
    const expire = provider.subscriptionInfo?.Expire ?? 0;

    return {
      name: provider.name,
      nodes: provider.proxies.length,
      update: toProviderUpdate(provider.updatedAt),
      usage: toProviderUsage(provider.subscriptionInfo),
      expiresAt: expire > 0 ? new Date(expire * MS_IN_SECOND) : null,
    };
  });
}
