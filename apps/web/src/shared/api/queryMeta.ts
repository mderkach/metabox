import i18next, { type ParseKeys } from 'i18next';
import { toast } from 'sonner';

import { API_FAILURE, ApiError, isSessionLost } from './ApiError';
import { failureText } from './failureText';

/**
 * Toast texts live in the `shared` namespace, not in the request's slice: one place
 * for the whole application shows them, and the slice dictionary may not be
 * loaded yet by then.
 */
export type MessageKey = ParseKeys<'shared'>;

/**
 * Error display. A union, not a set of optional fields: otherwise
 * `showSuccess: true` compiles without text and the request silently shows nothing.
 *
 * The key is optional with `showError` — then the error's own message is used:
 * the daemon sends it already ready to show.
 */
type ErrorMeta =
  | { readonly showError: true; readonly errorMessageKey?: MessageKey }
  | { readonly showError?: false; readonly errorMessageKey?: never };

type SuccessMeta =
  | { readonly showSuccess: true; readonly successMessageKey: MessageKey }
  | { readonly showSuccess?: false; readonly successMessageKey?: never };

/**
 * Notifications are set on the request and shown centrally in the client
 * cache — otherwise toasts spread across hooks (Query.md).
 */
export type QueryMeta = ErrorMeta & SuccessMeta;

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}

/**
 * Daemon unavailability is not shown as a toast: the banner in `app` reports it,
 * and duplicating it for every failed request would flood the screen
 * with identical messages.
 */
function isDaemonUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.kind === API_FAILURE.Unreachable;
}

/**
 * Failure text: what failed and why. The daemon sends the reason as a code, and
 * its translation is the panel's job; the daemon's message is used only when the code
 * is unfamiliar — it is in its language, not the user's.
 */
function errorText(meta: ErrorMeta, error: unknown): string {
  const action = meta.errorMessageKey === undefined ? null : i18next.t(meta.errorMessageKey, { ns: 'shared' });
  const reason = failureText(error) ?? (error instanceof Error ? error.message : null);

  if (action !== null && reason !== null) {
    return i18next.t('failure.withReason', { ns: 'shared', action, reason });
  }

  return action ?? reason ?? i18next.t('error.unknown', { ns: 'shared' });
}

/**
 * A lost session is not shown as a toast either: the shell answers it with the login screen,
 * and every request that was in flight at that moment would add its own toast.
 */
export function showQueryError(meta: QueryMeta | undefined, error: unknown) {
  if (meta?.showError !== true || isDaemonUnreachable(error) || isSessionLost(error)) {
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
