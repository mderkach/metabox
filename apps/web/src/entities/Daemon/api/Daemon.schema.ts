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
 * Shapes of the Clash API endpoints that the daemon proxies verbatim: it has no
 * types of its own for them, so the schemas are handwritten.
 */
export const ClashConfigsSchema = z.object({
  mode: z.string(),
  'mode-list': z.array(z.string()),
  'log-level': z.string(),
  'allow-lan': z.boolean(),
  'bind-address': z.string(),
  ipv6: z.boolean(),
});

/** Instantaneous speed over the last second, not an accumulating counter. */
export const ClashTrafficSampleSchema = z.object({
  up: z.number(),
  down: z.number(),
});

/**
 * The first stream sample is always zero, and the fork does not fill `oslimit`.
 * The screen must survive a zero first frame, not show "memory 0".
 */
export const ClashMemorySampleSchema = z.object({
  inuse: z.number(),
  oslimit: z.number(),
});

export type ClashConfigsWire = z.infer<typeof ClashConfigsSchema>;
