import { toast } from "sonner"

import { t, type MessageKey } from "../lib/i18n"
import { API_FAILURE, ApiError } from "./ApiError"

/**
 * Показ ошибки. Union, а не набор необязательных полей: иначе компилируется
 * `showSuccess: true` без текста и запрос молча ничего не показывает.
 *
 * Ключ при `showError` необязателен — тогда берётся сообщение самой ошибки:
 * демон присылает его уже готовым к показу.
 */
type ErrorMeta =
  | { readonly showError: true; readonly errorMessageKey?: MessageKey }
  | { readonly showError?: false; readonly errorMessageKey?: never }

type SuccessMeta =
  | { readonly showSuccess: true; readonly successMessageKey: MessageKey }
  | { readonly showSuccess?: false; readonly successMessageKey?: never }

/**
 * Уведомления задаются на запросе, а показываются централизованно в кэше
 * клиента — иначе тосты расползаются по хукам (Query.md).
 */
export type QueryMeta = ErrorMeta & SuccessMeta

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: QueryMeta
    mutationMeta: QueryMeta
  }
}

/**
 * Недоступность демона тостом не показывается: о ней говорит баннер в `app`,
 * и дублировать его на каждый отвалившийся запрос значит завалить экран
 * одинаковыми сообщениями.
 */
function isDaemonUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.kind === API_FAILURE.Unreachable
}

function errorText(meta: ErrorMeta, error: unknown): string {
  if (meta.errorMessageKey !== undefined) {
    return t(meta.errorMessageKey)
  }

  return error instanceof Error ? error.message : t("error.unknown")
}

export function showQueryError(meta: QueryMeta | undefined, error: unknown) {
  if (meta?.showError !== true || isDaemonUnreachable(error)) {
    return
  }

  toast.error(errorText(meta, error))
}

export function showQuerySuccess(meta: QueryMeta | undefined) {
  if (meta?.showSuccess !== true) {
    return
  }

  toast.success(t(meta.successMessageKey))
}
