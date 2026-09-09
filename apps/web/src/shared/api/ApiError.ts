/**
 * Вид отказа. Панель обязана работать при неработающем sing-box (NFR-1),
 * поэтому «демон не ответил» и «демон ответил ошибкой» — разные состояния
 * экрана, а не один общий «упало».
 */
export const API_FAILURE = {
  /** Запрос не дошёл: демон не поднят, сеть оборвана, вышел таймаут. */
  Unreachable: "unreachable",
  /** Демон ответил статусом ошибки. Данные экрана, редактор остаётся рабочим. */
  Response: "response",
} as const

export type ApiFailure = (typeof API_FAILURE)[keyof typeof API_FAILURE]

/**
 * Отказ обращения к демону.
 *
 * `details` не разбирается: у `check_failed` там дословный вывод sing-box,
 * который показывают пользователю как есть (ADR-0002), у остальных кодов —
 * ничего.
 */
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
