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
 * Незнакомая стадия читается как отказ применения.
 *
 * Демон и панель обновляются порознь, и стадия, которой панель не знает, не
 * имеет права выглядеть как успешное подтверждение: окно подтверждения тогда
 * закрылось бы само, а конфиг остался бы неподтверждённым (ADR-0002).
 */
function toPhase(value: string): ApplyPhase {
  return isPhase(value) ? value : APPLY_PHASE.Failed;
}

/** Незнакомое состояние службы читается как падение, а не как работа. */
function toServiceStatus(value: string): ServiceStatus {
  return isServiceStatus(value) ? value : SERVICE_STATUS.Failed;
}

/** Незнакомый код читается как «шаг не назван»: текст тогда берётся из `reason`. */
function toReasonCode(value: string | undefined): ApplyReasonCode | undefined {
  return APPLY_REASON_CODE.find((code) => code === value);
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
    singboxVersion: wire.singbox_version,
    singboxTags: wire.singbox_build?.tags ?? null,
    configPath: wire.config_path,
    transaction: wire.transaction === undefined ? undefined : toTransaction(wire.transaction),
    transactionHref: wire.transaction_href,
  };
}

function toState(wire: ServiceStateWire): ServiceState {
  return {
    status: toServiceStatus(wire.status),
    uptime: wire.uptime,
    binary: wire.binary,
    managed: wire.managed,
    lastError: wire.lastError,
  };
}

export function toServiceState(wire: ServiceStateWire): ServiceState {
  return toState(wire);
}

export function toTrafficHistory(wire: TrafficHistoryWire): TrafficHistory {
  return {
    stepSeconds: wire.step_seconds,
    points: wire.points,
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
 * Сэмплы и состояние службы приходят кадрами потока, поэтому непонятый кадр
 * отбраковывается, а не роняет подписку: следующий придёт через секунду
 * (ADR-0010).
 */
export function toTrafficFrame(raw: unknown): TrafficSample | null {
  return decodeFrame(ClashTrafficSampleSchema, raw, 'traffic');
}

export function toMemoryFrame(raw: unknown): MemorySample | null {
  return decodeFrame(ClashMemorySampleSchema, raw, 'memory');
}

/** Демон отдаёт температуру тысячными долями градуса, как её отдаёт ядро. */
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

/** Кадр кладётся в кэш `/api/service` (ADR-0010), поэтому не переводится. */
export function toServiceFrame(raw: unknown): ServiceStateWire | null {
  return decodeFrame(ServiceStateSchema, raw, 'service');
}
