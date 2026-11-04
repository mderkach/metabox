import type { ParseKeys } from 'i18next';

import { ApiError, failureText, type ApiFailureCode } from '@shared/api';

import { AUTH_PASSWORD_ERROR } from '../model';

type PasswordKey = ParseKeys<'features/Auth/AuthPassword'>;

export const FIELD_ERROR_KEY: Readonly<Record<string, PasswordKey | undefined>> = {
  [AUTH_PASSWORD_ERROR.CurrentRequired]: 'error.currentRequired',
  [AUTH_PASSWORD_ERROR.TooShort]: 'error.tooShort',
  [AUTH_PASSWORD_ERROR.TooLong]: 'error.tooLong',
  [AUTH_PASSWORD_ERROR.Mismatch]: 'error.mismatch',
};

const REFUSAL_KEY: Readonly<Record<string, PasswordKey | undefined>> = {
  password_wrong: 'error.wrong',
  login_locked: 'error.locked',
} satisfies Partial<Record<ApiFailureCode, PasswordKey>>;

export function refusalText(error: unknown, t: (key: PasswordKey) => string): string {
  const key = error instanceof ApiError && error.code !== null ? REFUSAL_KEY[error.code] : undefined;

  if (key !== undefined) {
    return t(key);
  }

  return failureText(error) ?? (error instanceof Error ? error.message : t('error.unknown'));
}
