import i18next, { type ParseKeys } from 'i18next';

import { ApiError } from './ApiError';

/**
 * Коды отказа демона. Набор объявлен у него в `internal/contract`, здесь его
 * зеркало: по коду панель выбирает текст на языке пользователя, а `message`
 * из ответа остаётся запасным — его показывать приходится, только если код
 * незнаком.
 */
export const API_FAILURE_CODE = {
  NotFound: 'not_found',
  OriginMismatch: 'origin_mismatch',
  UpgradeUnsupported: 'upgrade_unsupported',
  ConfigMissing: 'config_missing',
  VersionMissing: 'version_missing',
  ConnectionMissing: 'connection_missing',
  RuntimeUnavailable: 'runtime_unavailable',
  UnknownTransaction: 'unknown_transaction',
  ApplyInProgress: 'apply_in_progress',
  NothingToConfirm: 'nothing_to_confirm',
  ConfigModified: 'config_modified',
  ConfigTooLarge: 'config_too_large',
  CheckFailed: 'check_failed',
  Internal: 'internal',
} as const;

export type ApiFailureCode = (typeof API_FAILURE_CODE)[keyof typeof API_FAILURE_CODE];

const FAILURE_KEY: Readonly<Record<ApiFailureCode, ParseKeys<'shared'>>> = {
  [API_FAILURE_CODE.NotFound]: 'failure.not_found',
  [API_FAILURE_CODE.OriginMismatch]: 'failure.origin_mismatch',
  [API_FAILURE_CODE.UpgradeUnsupported]: 'failure.upgrade_unsupported',
  [API_FAILURE_CODE.ConfigMissing]: 'failure.config_missing',
  [API_FAILURE_CODE.VersionMissing]: 'failure.version_missing',
  [API_FAILURE_CODE.ConnectionMissing]: 'failure.connection_missing',
  [API_FAILURE_CODE.RuntimeUnavailable]: 'failure.runtime_unavailable',
  [API_FAILURE_CODE.UnknownTransaction]: 'failure.unknown_transaction',
  [API_FAILURE_CODE.ApplyInProgress]: 'failure.apply_in_progress',
  [API_FAILURE_CODE.NothingToConfirm]: 'failure.nothing_to_confirm',
  [API_FAILURE_CODE.ConfigModified]: 'failure.config_modified',
  [API_FAILURE_CODE.ConfigTooLarge]: 'failure.config_too_large',
  [API_FAILURE_CODE.CheckFailed]: 'failure.check_failed',
  [API_FAILURE_CODE.Internal]: 'failure.internal',
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
