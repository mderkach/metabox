import i18next, { type ParseKeys } from 'i18next';

import { ApiError } from './ApiError';
import { ERROR_CODE } from './daemon.generated';

/**
 * Код отказа демона. Набор объявлен у него в `internal/contract` и приезжает
 * сюда списком в схеме контракта, поэтому таблица ниже обязана покрывать его
 * целиком: новый код у демона — ошибка компиляции у панели, а не
 * непереведённый текст на экране.
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
  log_unavailable: 'failure.log_unavailable',
  log_query_invalid: 'failure.log_query_invalid',
  log_stream_limit: 'failure.log_stream_limit',
  log_clear_forbidden: 'failure.log_clear_forbidden',
  list_invalid: 'failure.list_invalid',
  workdir_mismatch: 'failure.workdir_mismatch',
  launch_mismatch: 'failure.launch_mismatch',
  check_failed: 'failure.check_failed',
  internal: 'failure.internal',
};

function isKnownCode(code: string | null): code is ApiFailureCode {
  return code !== null && code in FAILURE_KEY;
}

/**
 * Причина отказа словами пользователя или `null`, когда код демону известен не
 * был. Незнакомый код — это новый вид отказа: перевода у панели для него нет,
 * и врать общей фразой она не должна.
 */
export function failureText(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isKnownCode(error.code)) {
    return null;
  }

  return i18next.t(FAILURE_KEY[error.code], { ns: 'shared' });
}
