import type { Namespace, TFunction } from 'i18next';

import type { LatencyHistoryWire } from '@shared/api/daemon.generated';

import { toDelayLabel } from './Proxy.delay';
import {
  DELAY_STATE,
  DELAY_TIMEOUT,
  GROUP_TYPES,
  SERVICE_GROUPS,
  type DelayState,
  type ProxyNode,
} from './Proxy.model';

export const LATENCY_LEVEL = {
  NoMeasurement: 'no_measurement',
  NoAnswer: 'no_answer',
  WithinNorm: 'within_norm',
  AboveNorm: 'above_norm',
  AboveCeiling: 'above_ceiling',
} as const;

type LatencyLevel = (typeof LATENCY_LEVEL)[keyof typeof LATENCY_LEVEL];

export interface ServerLatencyPoint {
  at: string;
  delayMS: number | null;
}

export interface ServerLatency {
  current: ServerLatencyPoint | null;
  recent: ServerLatencyPoint[];
  hourly: ServerLatencyPoint[];
  usualMS: number | null;
  computedUsualMS: number | null;
  origin: string;
  level: LatencyLevel;
}

export type ServerLatencies = ReadonlyMap<string, ServerLatency>;

export function toServerLatencies(wire: LatencyHistoryWire): { available: boolean; servers: ServerLatencies } {
  const available = wire.available !== false;

  return { available, servers: toLatencyByTag(wire, available) };
}

function toLatencyByTag(wire: LatencyHistoryWire, available: boolean): ServerLatencies {
  return new Map(
    wire.servers.map((server) => [
      server.tag,
      {
        current:
          available && server.current ? { at: server.current.at, delayMS: server.current.delay_ms ?? null } : null,
        recent: server.recent.map((point) => ({ at: point.at, delayMS: point.delay_ms ?? null })),
        hourly: server.hourly.map((point) => ({ at: point.hour, delayMS: point.delay_ms })),
        usualMS: server.usual_ms ?? null,
        computedUsualMS: server.computed_usual_ms ?? null,
        origin: server.origin,
        level: available
          ? (Object.values(LATENCY_LEVEL).find((level) => level === server.level) ?? LATENCY_LEVEL.NoMeasurement)
          : LATENCY_LEVEL.NoMeasurement,
      },
    ])
  );
}

const NON_SERVER_TYPES: ReadonlySet<string> = new Set(['Direct', 'Reject', 'DNS', 'Block']);

export function isLatencyServer(node: ProxyNode): boolean {
  return !GROUP_TYPES.has(node.type) && !SERVICE_GROUPS.has(node.name) && !NON_SERVER_TYPES.has(node.type);
}

export function serverDelay(latency: ServerLatency | undefined): { delay: number | null; delayState: DelayState } {
  if (latency?.current == null || latency.level === LATENCY_LEVEL.NoMeasurement) {
    return { delay: null, delayState: DELAY_STATE.Unknown };
  }
  if (latency.current.delayMS === null || latency.level === LATENCY_LEVEL.NoAnswer) {
    return { delay: DELAY_TIMEOUT, delayState: DELAY_STATE.Failed };
  }

  return {
    delay: latency.current.delayMS,
    delayState: latency.level === LATENCY_LEVEL.WithinNorm ? DELAY_STATE.Fast : DELAY_STATE.Slow,
  };
}

export function toServerDelayLabel(
  t: TFunction<Namespace>,
  latency: ServerLatency | undefined,
  available = true
): string {
  if (!available) return t('delay.unavailable', { ns: 'shared' });

  const reading = serverDelay(latency);

  return reading.delay === null ? t('delay.noMeasurement', { ns: 'shared' }) : toDelayLabel(t, reading);
}
