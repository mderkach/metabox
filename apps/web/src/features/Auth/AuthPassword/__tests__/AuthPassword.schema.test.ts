import { describe, expect, it } from 'vitest';

import { AUTH_PASSWORD_ERROR, toAuthPasswordSchema } from '../model';

function errors(protectedPanel: boolean, value: { current: string; password: string; confirm: string }) {
  const result = toAuthPasswordSchema(protectedPanel).safeParse(value);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('toAuthPasswordSchema', () => {
  it('accepts the first password without the current one', () => {
    expect(errors(false, { current: '', password: '12345678', confirm: '12345678' })).toEqual([]);
  });

  it('asks for the current password on a protected panel', () => {
    expect(errors(true, { current: '', password: '12345678', confirm: '12345678' })).toEqual([
      AUTH_PASSWORD_ERROR.CurrentRequired,
    ]);
  });

  it('rejects a password outside the length limits', () => {
    const long = 'x'.repeat(129);

    expect(errors(false, { current: '', password: '1234567', confirm: '1234567' })).toEqual([
      AUTH_PASSWORD_ERROR.TooShort,
    ]);
    expect(errors(false, { current: '', password: long, confirm: long })).toEqual([AUTH_PASSWORD_ERROR.TooLong]);
  });

  it('rejects a confirmation that differs', () => {
    expect(errors(false, { current: '', password: '12345678', confirm: '12345679' })).toEqual([
      AUTH_PASSWORD_ERROR.Mismatch,
    ]);
  });

  it('counts characters by code point, as the daemon does', () => {
    const emoji = '😀'.repeat(4);

    expect(errors(false, { current: '', password: emoji, confirm: emoji })).toEqual([AUTH_PASSWORD_ERROR.TooShort]);
  });
});
