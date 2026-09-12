import { z } from 'zod';

/**
 * Формы ответов демона и проксированных им ручек Clash API. Схемы описывают
 * то, что пришло по проводу; перевод в модель — в `model/Daemon.adapter.ts`.
 */
export const ApplyTransactionSchema = z.object({
  id: z.string(),
  phase: z.string(),
  /** Остаток окна подтверждения в наносекундах: Go отдаёт `time.Duration`. */
  window: z.number(),
  sha256: z.string().optional(),
  reason: z.string().optional(),
  clash_api_added: z.boolean().optional(),
});

export const DaemonStatusSchema = z.object({
  /** Версия демона, а не sing-box: бинарь отдаётся полем `singbox_version`. */
  version: z.string(),
  singbox_version: z.string().optional(),
  config_path: z.string().optional(),
  transaction: ApplyTransactionSchema.optional(),
  transaction_href: z.string().optional(),
});

export const ServiceStateSchema = z.object({
  status: z.string(),
  /** Секунды с момента старта; `0`, когда сервис не запущен. */
  uptime: z.number(),
  binary: z.string(),
  /** Вывод последнего падения: показывается дословно, разбирать его нельзя. */
  lastError: z.string().optional(),
});

export const ClashConfigsSchema = z.object({
  mode: z.string(),
  'mode-list': z.array(z.string()),
  'log-level': z.string(),
  'allow-lan': z.boolean(),
  'bind-address': z.string(),
  ipv6: z.boolean(),
});

export const ClashVersionSchema = z.object({
  meta: z.boolean(),
  premium: z.boolean(),
  version: z.string(),
});

/** Мгновенная скорость за последнюю секунду, а не накопительный счётчик. */
export const ClashTrafficSampleSchema = z.object({
  up: z.number(),
  down: z.number(),
});

/**
 * Первый сэмпл потока всегда нулевой, а `oslimit` форк не заполняет. Экран
 * обязан пережить нулевой первый кадр, а не показать «памяти 0».
 */
export const ClashMemorySampleSchema = z.object({
  inuse: z.number(),
  oslimit: z.number(),
});

export type ApplyTransactionWire = z.infer<typeof ApplyTransactionSchema>;
export type DaemonStatusWire = z.infer<typeof DaemonStatusSchema>;
export type ServiceStateWire = z.infer<typeof ServiceStateSchema>;
export type ClashConfigsWire = z.infer<typeof ClashConfigsSchema>;
export type ClashVersionWire = z.infer<typeof ClashVersionSchema>;
