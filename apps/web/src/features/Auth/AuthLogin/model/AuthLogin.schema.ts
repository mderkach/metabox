import { z } from 'zod';

export const AUTH_LOGIN_ERROR = {
  Required: 'required',
} as const;

export const AuthLoginSchema = z.object({
  /** Panel password; its length rules are checked when it is set, not at login */
  password: z.string().min(1, AUTH_LOGIN_ERROR.Required),
});

export type AuthLoginModel = z.infer<typeof AuthLoginSchema>;
