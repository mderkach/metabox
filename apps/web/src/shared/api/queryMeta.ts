import i18next, { type ParseKeys } from 'i18next';
import { toast } from 'sonner';

import { API_FAILURE, ApiError } from './ApiError';

/**
 * Тексты тостов живут в неймспейсе `shared`, а не в слайсе запроса: показывает
 * их одно место на всё приложение, и словарь слайса к этому моменту может быть
 * ещё не загружен.
 */
export type MessageKey = ParseKeys<'shared'>;

/**
 * Показ ошибки. Union, а не набор необязательных полей: иначе компилируется
 * `showSuccess: true` без текста и запрос молча ничего не показывает.
 *
 * Ключ при `showError` необязателен — тогда берётся сообщение самой ошибки:
 * демон присылает его уже готовым к показу.
 */
type ErrorMeta =
  | { readonly showError: true; readonly errorMessageKey?: MessageKey }
  | { readonly showError?: false; readonly errorMessageKey?: never };

type SuccessMeta =
  | { readonly showSuccess: true; readonly successMessageKey: MessageKey }
  | { readonly showSuccess?: false; readonly successMessageKey?: never };

/**
 * Уведомления задаются на запросе, а показываются централизованно в кэше
 * клиента — иначе тосты расползаются по хукам (Query.md).
 */
export type QueryMeta = ErrorMeta & SuccessMeta;

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}

/**
 * Недоступность демона тостом не показывается: о ней говорит баннер в `app`,
 * и дублировать его на каждый отвалившийся запрос значит завалить экран
 * одинаковыми сообщениями.
 */
function isDaemonUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.kind === API_FAILURE.Unreachable;
}

function errorText(meta: ErrorMeta, error: unknown): string {
  if (meta.errorMessageKey !== undefined) {
    return i18next.t(meta.errorMessageKey, { ns: 'shared' });
  }

  return error instanceof Error ? error.message : i18next.t('toast.error.unknown', { ns: 'shared' });
}

export function showQueryError(meta: QueryMeta | undefined, error: unknown) {
  if (meta?.showError !== true || isDaemonUnreachable(error)) {
    return;
  }

  toast.error(errorText(meta, error));
}

export function showQuerySuccess(meta: QueryMeta | undefined) {
  if (meta?.showSuccess !== true) {
    return;
  }

  toast.success(i18next.t(meta.successMessageKey, { ns: 'shared' }));
}
