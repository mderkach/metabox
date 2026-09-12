import { z } from 'zod';

import { decodeFrame, decodeResponse } from '@shared/api';

import {
  ApplyTransactionSchema,
  ClashConfigsSchema,
  ClashMemorySampleSchema,
  ClashTrafficSampleSchema,
  ClashVersionSchema,
  DaemonStatusSchema,
  ServiceStateSchema,
  type DaemonStatusWire,
} from '../api/Daemon.schema';
import {
  APPLY_PHASE,
  CLASH_MODE,
  SERVICE_STATUS,
  type ApplyPhase,
  type ApplyTransaction,
  type ClashConfigs,
  type ClashMode,
  type ClashVersion,
  type DaemonStatus,
  type MemorySample,
  type ServiceState,
  type ServiceStatus,
  type TrafficSample,
} from './Daemon.model';

const PHASES = new Set<string>(Object.values(APPLY_PHASE));
const STATUSES = new Set<string>(Object.values(SERVICE_STATUS));
const MODES = new Set<string>(Object.values(CLASH_MODE));

function isPhase(value: string): value is ApplyPhase {
  return PHASES.has(value);
}

function isServiceStatus(value: string): value is ServiceStatus {
  return STATUSES.has(value);
}

function isMode(value: string): value is ClashMode {
  return MODES.has(value);
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

function toMode(value: string): ClashMode {
  return isMode(value) ? value : CLASH_MODE.Rule;
}

function toTransaction(wire: NonNullable<DaemonStatusWire['transaction']>): ApplyTransaction {
  return {
    id: wire.id,
    phase: toPhase(wire.phase),
    window: wire.window,
    sum: wire.sha256,
    reason: wire.reason,
    clashApiAdded: wire.clash_api_added,
  };
}

export function toApplyTransaction(raw: unknown): ApplyTransaction {
  return toTransaction(decodeResponse(ApplyTransactionSchema, raw, 'apply'));
}

export function toDaemonStatus(raw: unknown): DaemonStatus {
  const wire = decodeResponse(DaemonStatusSchema, raw, 'status');

  return {
    version: wire.version,
    singboxVersion: wire.singbox_version,
    configPath: wire.config_path,
    transaction: wire.transaction === undefined ? undefined : toTransaction(wire.transaction),
    transactionHref: wire.transaction_href,
  };
}

function toState(wire: z.infer<typeof ServiceStateSchema>): ServiceState {
  return {
    status: toServiceStatus(wire.status),
    uptime: wire.uptime,
    binary: wire.binary,
    lastError: wire.lastError,
  };
}

export function toServiceState(raw: unknown): ServiceState {
  return toState(decodeResponse(ServiceStateSchema, raw, 'service'));
}

export function toClashConfigs(raw: unknown): ClashConfigs {
  const wire = decodeResponse(ClashConfigsSchema, raw, 'clash configs');

  return {
    mode: toMode(wire.mode),
    modeList: wire['mode-list'].map(toMode),
    logLevel: wire['log-level'],
    allowLan: wire['allow-lan'],
    bindAddress: wire['bind-address'],
    ipv6: wire.ipv6,
  };
}

export function toClashVersion(raw: unknown): ClashVersion {
  return decodeResponse(ClashVersionSchema, raw, 'clash version');
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

export function toServiceFrame(raw: unknown): ServiceState | null {
  const wire = decodeFrame(ServiceStateSchema, raw, 'service');

  return wire === null ? null : toState(wire);
}
