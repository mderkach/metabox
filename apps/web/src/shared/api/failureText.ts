import i18next, { type ParseKeys } from 'i18next';

import { ApiError } from './ApiError';
import { ERROR_CODE } from './daemon.generated';

/**
 * Daemon failure code. The set is declared in its `internal/contract` and arrives
 * here as a list in the contract schema, so the table below must cover it
 * entirely: a new code in the daemon is a compile error in the panel, not
 * untranslated text on screen.
 */
export type ApiFailureCode = (typeof ERROR_CODE)[number];

const FAILURE_KEY: Readonly<Record<ApiFailureCode, ParseKeys<'shared'>>> = {
  not_found: 'failure.not_found',
  origin_mismatch: 'failure.origin_mismatch',
  upgrade_unsupported: 'failure.upgrade_unsupported',
  config_missing: 'failure.config_missing',
  version_missing: 'failure.version_missing',
  connection_missing: 'failure.connection_missing',
  runtime_unavailable: 'failure.runtime_unavailable',
  unknown_transaction: 'failure.unknown_transaction',
  apply_in_progress: 'failure.apply_in_progress',
  nothing_to_confirm: 'failure.nothing_to_confirm',
  config_modified: 'failure.config_modified',
  config_too_large: 'failure.config_too_large',
  device_invalid: 'failure.device_invalid',
  dataplane_invalid: 'failure.dataplane_invalid',
  dataplane_modified: 'failure.dataplane_modified',
  dataplane_foreign_service: 'failure.dataplane_foreign_service',
  log_unavailable: 'failure.log_unavailable',
  log_query_invalid: 'failure.log_query_invalid',
  log_stream_limit: 'failure.log_stream_limit',
  log_clear_forbidden: 'failure.log_clear_forbidden',
  list_invalid: 'failure.list_invalid',
  workdir_mismatch: 'failure.workdir_mismatch',
  launch_mismatch: 'failure.launch_mismatch',
  unauthorized: 'failure.unauthorized',
  password_wrong: 'failure.password_wrong',
  password_invalid: 'failure.password_invalid',
  login_locked: 'failure.login_locked',
  auth_disabled: 'failure.auth_disabled',
  check_failed: 'failure.check_failed',
  internal: 'failure.internal',
};

function isKnownCode(code: string | null): code is ApiFailureCode {
  return code !== null && code in FAILURE_KEY;
}

/**
 * Failure reason in the user's words or `null` when the code was not known to the
 * daemon. An unfamiliar code is a new kind of failure: the panel has no translation for it,
 * and it must not lie with a generic phrase.
 */
export function failureText(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isKnownCode(error.code)) {
    return null;
  }

  return i18next.t(FAILURE_KEY[error.code], { ns: 'shared' });
}
