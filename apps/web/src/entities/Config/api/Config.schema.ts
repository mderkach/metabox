import { z } from 'zod';

/**
 * Формы ответов демона по конфигу. Сам конфиг сюда не попадает: он читается
 * текстом и разбирается схемой форка (ADR-0004, ADR-0001).
 */
export const ConfigVersionSchema = z.object({
  /** Монотонный номер. Порядок задаётся им, а не временем: у роутера нет RTC. */
  id: z.int(),
  size: z.number(),
  sum: z.string(),
  /** Секунды Unix по часам устройства. Ноль — часы не синхронизованы. */
  saved_at: z.number(),
});

export const ConfigVersionsSchema = z.object({
  versions: z.array(ConfigVersionSchema),
});

/**
 * Вывод `sing-box check` в отказе `check_failed` — единственная внутренняя
 * подробность, которую демон отдаёт наружу (ADR-0002): на этих строках
 * пользователь чинит конфиг.
 */
export const CheckDetailsSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.int(),
});

export type ConfigVersionWire = z.infer<typeof ConfigVersionSchema>;
export type ConfigVersionsWire = z.infer<typeof ConfigVersionsSchema>;
