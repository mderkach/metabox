import { z } from 'zod';

/** Daemon limits for a new password, in characters. */
export const PASSWORD_LIMIT = {
  Min: 8,
  Max: 128,
} as const;

export const AUTH_PASSWORD_ERROR = {
  CurrentRequired: 'currentRequired',
  TooShort: 'tooShort',
  TooLong: 'tooLong',
  Mismatch: 'mismatch',
} as const;

/** Characters as the daemon counts them, by code point: `length` counts UTF-16 units, and an emoji is two. */
function characters(value: string): number {
  // oxlint-disable-next-line typescript/no-misused-spread -- code points are wanted here: the daemon counts runes, not graphemes
  return [...value].length;
}

const CurrentSchema = z.string().min(1, AUTH_PASSWORD_ERROR.CurrentRequired);

/**
 * The current password is asked only when the panel already has one: the first password
 * is set without it.
 */
export function toAuthPasswordSchema(protectedPanel: boolean) {
  return z
    .object({
      /** Password in force */
      current: protectedPanel ? CurrentSchema : z.string(),
      /** New password */
      password: z
        .string()
        .refine((value) => characters(value) >= PASSWORD_LIMIT.Min, AUTH_PASSWORD_ERROR.TooShort)
        .refine((value) => characters(value) <= PASSWORD_LIMIT.Max, AUTH_PASSWORD_ERROR.TooLong),
      /** The new password once more: a typo here locks the owner out until a reset over SSH */
      confirm: z.string(),
    })
    .refine((value) => value.password === value.confirm, {
      path: ['confirm'],
      message: AUTH_PASSWORD_ERROR.Mismatch,
    });
}

export type AuthPasswordModel = z.infer<ReturnType<typeof toAuthPasswordSchema>>;

/** Removal needs only the current password. */
export const AuthPasswordRemoveSchema = z.object({ current: CurrentSchema });
