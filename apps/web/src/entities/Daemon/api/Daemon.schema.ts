import { z } from 'zod';

export {
  APPLY_REASON_CODE,
  SERVICE_ERROR_CODE,
  HistorySchema as TrafficHistorySchema,
  ServiceSchema as ServiceStateSchema,
  StatSchema as SystemStatSchema,
  StatusSchema as DaemonStatusSchema,
  TransactionSchema as ApplyTransactionSchema,
} from '@shared/api/daemon.generated';
export type {
  DevicePointWire,
  HistoryWire as TrafficHistoryWire,
  ServiceWire as ServiceStateWire,
  StatWire as SystemStatWire,
  StatusWire as DaemonStatusWire,
  TransactionWire as ApplyTransactionWire,
} from '@shared/api/daemon.generated';

/**
 * Формы ручек Clash API, которые демон проксирует дословно: своих
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
