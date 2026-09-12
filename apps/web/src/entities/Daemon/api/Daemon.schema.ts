import { z } from 'zod';

export {
  ServiceSchema as ServiceStateSchema,
  StatusSchema as DaemonStatusSchema,
  TransactionSchema as ApplyTransactionSchema,
} from '@shared/api/daemon.generated';
export type {
  ServiceWire as ServiceStateWire,
  StatusWire as DaemonStatusWire,
  TransactionWire as ApplyTransactionWire,
} from '@shared/api/daemon.generated';

/**
 * Формы ручек Clash API, которые демон проксирует дословно (ADR-0006): своих
 * типов у него для них нет, поэтому схемы рукописные.
 */
export const ClashConfigsSchema = z.object({
  mode: z.string(),
  'mode-list': z.array(z.string()),
  'log-level': z.string(),
  'allow-lan': z.boolean(),
  'bind-address': z.string(),
  ipv6: z.boolean(),
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

export type ClashConfigsWire = z.infer<typeof ClashConfigsSchema>;
