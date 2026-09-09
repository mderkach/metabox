import type { AxiosRequestConfig } from "axios"

import { API_ENDPOINT, ApiClientInstance } from "@shared/api"

/** Стадия применения. Значения приходят с демона (`apply.Phase`). */
export const APPLY_PHASE = {
  Applying: "applying",
  AwaitingConfirm: "awaiting_confirm",
  Confirmed: "confirmed",
  RolledBack: "rolled_back",
  Failed: "failed",
} as const

export type ApplyPhase = (typeof APPLY_PHASE)[keyof typeof APPLY_PHASE]

/** Снимок применения — `apply.Transaction`. */
export interface ApplyTransaction {
  id: string
  phase: ApplyPhase
  /** Остаток окна подтверждения в наносекундах: Go отдаёт `time.Duration`. */
  window: number
  sha256?: string
  reason?: string
  clash_api_added?: boolean
}

/** Ответ `GET /api/status`. */
export interface DaemonStatus {
  version: string
  transaction?: ApplyTransaction
  transaction_href?: string
}

export async function getDaemonStatus(
  config?: AxiosRequestConfig
): Promise<DaemonStatus> {
  return ApiClientInstance.get<DaemonStatus>(API_ENDPOINT.status(), config)
}
