import { z } from 'zod';

/** Daemon ceiling for an own name, in characters: the label sits in a table cell. */
export const DEVICE_NAME_LIMIT = 64;

export const DEVICE_RENAME_ERROR = {
  TooLong: 'tooLong',
  ControlChars: 'controlChars',
} as const;

const CONTROL_CHARS = /\p{Cc}/u;

export const DeviceRenameSchema = z.object({
  /** Own name; empty clears it, and the label returns to the static lease or DHCP */
  name: z
    .string()
    .trim()
    .max(DEVICE_NAME_LIMIT, DEVICE_RENAME_ERROR.TooLong)
    .refine((name) => !CONTROL_CHARS.test(name), DEVICE_RENAME_ERROR.ControlChars),
});

export type DeviceRenameModel = z.infer<typeof DeviceRenameSchema>;
