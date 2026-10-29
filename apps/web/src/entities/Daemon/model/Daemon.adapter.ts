import { decodeFrame } from '@shared/api';

import type {
  ApplyTransactionWire,
  ClashConfigsWire,
  DaemonStatusWire,
  ServiceStateWire,
  SystemStatWire,
  TrafficHistoryWire,
} from '../api/Daemon.schema';
import {
  ClashMemorySampleSchema,
  ClashTrafficSampleSchema,
  ServiceStateSchema,
  SystemStatSchema,
  APPLY_REASON_CODE,
  SERVICE_ERROR_CODE,
} from '../api/Daemon.schema';
import {
  APPLY_PHASE,
  SERVICE_STATUS,
  type ApplyPhase,
  type ApplyReasonCode,
  type ApplyTransaction,
  type ClashConfigs,
  type DaemonStatus,
  type MemorySample,
  type ServiceErrorCode,
  type ServiceState,
  type ServiceStatus,
  type SystemStat,
  type TrafficHistory,
  type TrafficSample,
} from './Daemon.model';

const PHASES = new Set<string>(Object.values(APPLY_PHASE));
const STATUSES = new Set<string>(Object.values(SERVICE_STATUS));

function isPhase(value: string): value is ApplyPhase {
  return PHASES.has(value);
}

function isServiceStatus(value: string): value is ServiceStatus {
  return STATUSES.has(value);
}

/**
 * An unfamiliar stage is read as an apply failure.
 *
 * The daemon and the panel are updated separately, and a stage the panel does
 * not know must not look like a successful confirmation: the confirmation
 * window would close on its own and the config would remain unconfirmed.
 */
function toPhase(value: string): ApplyPhase {
  return isPhase(value) ? value : APPLY_PHASE.Failed;
}

/** An unfamiliar service state is read as a crash, not as running. */
function toServiceStatus(value: string): ServiceStatus {
  return isServiceStatus(value) ? value : SERVICE_STATUS.Failed;
}

/** An unfamiliar code is read as "step not named": the text is then taken from `reason`. */
function toReasonCode(value: string | undefined): ApplyReasonCode | undefined {
  return APPLY_REASON_CODE.find((code) => code === value);
}

/** An unfamiliar code is read as its absence: the text is then taken from `lastError`. */
function toServiceErrorCode(value: string | undefined): ServiceErrorCode | undefined {
  return SERVICE_ERROR_CODE.find((code) => code === value);
}

function toTransaction(wire: NonNullable<DaemonStatusWire['transaction']>): ApplyTransaction {
  return {
    id: wire.id,
    phase: toPhase(wire.phase),
    window: wire.window,
    sum: wire.sha256,
    reasonCode: toReasonCode(wire.reason_code),
    reason: wire.reason,
    clashApiAdded: wire.clash_api_added,
  };
}

export function toApplyTransaction(wire: ApplyTransactionWire): ApplyTransaction {
  return toTransaction(wire);
}

export function toDaemonStatus(wire: DaemonStatusWire): DaemonStatus {
  return {
    version: wire.version,
    instance: wire.instance,
    singboxVersion: wire.singbox_version,
    singboxTags: wire.singbox_build?.tags ?? null,
    configPath: wire.config_path,
    confirmWindowSeconds: wire.confirm_window_seconds,
    transaction: wire.transaction === undefined ? undefined : toTransaction(wire.transaction),
    transactionHref: wire.transaction_href,
    dataplaneTransaction:
      wire.dataplane_transaction === undefined ? undefined : toTransaction(wire.dataplane_transaction),
  };
}

function toState(wire: ServiceStateWire): ServiceState {
  return {
    status: toServiceStatus(wire.status),
    uptime: wire.uptime,
    binary: wire.binary,
    managed: wire.managed,
    lastError: wire.lastError,
    lastErrorCode: toServiceErrorCode(wire.lastErrorCode),
  };
}

export function toServiceState(wire: ServiceStateWire): ServiceState {
  return toState(wire);
}

export function toTrafficHistory(wire: TrafficHistoryWire): TrafficHistory {
  return {
    stepSeconds: wire.step_seconds,
    points: wire.points,
    deviceStepSeconds: wire.device_step_seconds,
    device: wire.device,
    recent: wire.recent,
    connections: wire.connections,
  };
}

export function toClashConfigs(wire: ClashConfigsWire): ClashConfigs {
  return {
    mode: wire.mode,
    modeList: wire['mode-list'],
    logLevel: wire['log-level'],
    allowLan: wire['allow-lan'],
    bindAddress: wire['bind-address'],
    ipv6: wire.ipv6,
  };
}

/**
 * Samples and service state arrive as stream frames, so a frame that is not
 * understood is rejected and does not drop the subscription: the next one
 * arrives in a second.
 */
export function toTrafficFrame(raw: unknown): TrafficSample | null {
  return decodeFrame(ClashTrafficSampleSchema, raw, 'traffic');
}

export function toMemoryFrame(raw: unknown): MemorySample | null {
  return decodeFrame(ClashMemorySampleSchema, raw, 'memory');
}

/** The daemon serves temperature in thousandths of a degree, as the kernel does. */
const MILLI_DEGREES = 1000;

function toStat(wire: SystemStatWire): SystemStat {
  return {
    load: wire.load,
    memory: wire.memory,
    thermal: wire.thermal.map((zone) => ({ name: zone.name, celsius: zone.milli / MILLI_DEGREES })),
    uplink: wire.uplink,
    share: wire.share,
    singbox: wire.singbox,
    daemon: wire.daemon,
    uptime: wire.uptime,
  };
}

export function toSystemFrame(raw: unknown): SystemStat | null {
  const wire = decodeFrame(SystemStatSchema, raw, 'system');

  return wire === null ? null : toStat(wire);
}

/** The frame is put into the `/api/service` cache, so it is not translated. */
export function toServiceFrame(raw: unknown): ServiceStateWire | null {
  return decodeFrame(ServiceStateSchema, raw, 'service');
}
