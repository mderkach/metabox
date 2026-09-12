import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import type { ClashConfigs, ServiceAction, ServiceState } from './Daemon.dto';
import { DAEMON_ENDPOINT } from './Daemon.endpoints';

/** Стадия применения. Значения приходят с демона (`apply.Phase`). */
export const APPLY_PHASE = {
  Applying: 'applying',
  AwaitingConfirm: 'awaiting_confirm',
  Confirmed: 'confirmed',
  RolledBack: 'rolled_back',
  Failed: 'failed',
} as const;

export type ApplyPhase = (typeof APPLY_PHASE)[keyof typeof APPLY_PHASE];

/** Снимок применения — `apply.Transaction`. */
export interface ApplyTransaction {
  id: string;
  phase: ApplyPhase;
  /** Остаток окна подтверждения в наносекундах: Go отдаёт `time.Duration`. */
  window: number;
  sha256?: string;
  reason?: string;
  clash_api_added?: boolean;
}

/** Ответ `GET /api/status`. */
export interface DaemonStatus {
  /** Версия демона, а не sing-box: бинарь отдаётся полем `singbox_version`. */
  version: string;
  /** Версия sing-box на устройстве; отсутствует, если демон её не прочитал. */
  singbox_version?: string;
  /** Файл, которым владеет демон: путь задаётся флагами его запуска. */
  config_path?: string;
  transaction?: ApplyTransaction;
  transaction_href?: string;
}

export async function getDaemonStatus(config?: AxiosRequestConfig): Promise<DaemonStatus> {
  return ApiClientInstance.get<DaemonStatus>(DAEMON_ENDPOINT.status(), config);
}

export async function getServiceState(config?: AxiosRequestConfig): Promise<ServiceState> {
  return ApiClientInstance.get<ServiceState>(DAEMON_ENDPOINT.service(), config);
}

/**
 * Действие над сервисом. Ответ — новое состояние: перечитывать его отдельным
 * запросом незачем, а гадать по коду ответа нельзя.
 */
export async function runServiceAction(action: ServiceAction): Promise<ServiceState> {
  return ApiClientInstance.post<ServiceState>(DAEMON_ENDPOINT.serviceAction(action));
}

/** Режим маршрутизации рантайма: `Rule`, `Global` или `Direct`. */
export async function getClashConfigs(config?: AxiosRequestConfig): Promise<ClashConfigs> {
  return ApiClientInstance.get<ClashConfigs>(DAEMON_ENDPOINT.clashConfigs(), config);
}
