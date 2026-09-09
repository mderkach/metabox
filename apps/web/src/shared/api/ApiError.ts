/** Недоступность демона гасит панель, его ответ ошибкой — только экран (NFR-1). */
export const API_FAILURE = {
  Unreachable: "unreachable",
  Response: "response",
} as const

export type ApiFailure = (typeof API_FAILURE)[keyof typeof API_FAILURE]

/** `details` у `check_failed` несёт дословный вывод sing-box (ADR-0002). */
export class ApiError extends Error {
  readonly kind: ApiFailure
  readonly status: number | null
  readonly code: string | null
  readonly details: unknown

  constructor(
    kind: ApiFailure,
    message: string,
    extra?: {
      status?: number
      code?: string
      details?: unknown
      cause?: unknown
    }
  ) {
    super(message, { cause: extra?.cause })
    this.name = "ApiError"
    this.kind = kind
    this.status = extra?.status ?? null
    this.code = extra?.code ?? null
    this.details = extra?.details
  }
}
