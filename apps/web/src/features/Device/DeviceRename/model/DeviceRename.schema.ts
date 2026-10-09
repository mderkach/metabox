import { z } from 'zod';

/** Потолок демона на своё имя, в символах: подпись стоит в ячейке таблицы. */
export const DEVICE_NAME_LIMIT = 64;

export const DEVICE_RENAME_ERROR = {
  TooLong: 'tooLong',
  ControlChars: 'controlChars',
} as const;

const CONTROL_CHARS = /\p{Cc}/u;

export const DeviceRenameSchema = z.object({
  /** Своё имя; пустое снимает его, и подпись возвращается к статической аренде или DHCP */
  name: z
    .string()
    .trim()
    .max(DEVICE_NAME_LIMIT, DEVICE_RENAME_ERROR.TooLong)
    .refine((name) => !CONTROL_CHARS.test(name), DEVICE_RENAME_ERROR.ControlChars),
});

export type DeviceRenameModel = z.infer<typeof DeviceRenameSchema>;
