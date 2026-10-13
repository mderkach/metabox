import { z } from 'zod';

/**
 * Clash API proxy responses. The daemon serves them verbatim, so the field
 * names here are foreign: they arrive like this over the wire.
 */
export const ClashDelaySchema = z.object({
  time: z.string(),
  /** `delay: 65535` means the node did not answer, not "very slow". */
  delay: z.number(),
});

/**
 * A node or a group: they differ only in the `now` and `all` fields, the Clash
 * API has no separate type. Groups are `Selector`, `URLTest`, `Fallback`,
 * `LoadBalance`.
 */
export const ClashProxySchema = z.object({
  type: z.string(),
  name: z.string(),
  udp: z.boolean(),
  history: z.array(ClashDelaySchema),
  now: z.string().optional(),
  all: z.array(z.string()).optional(),
});

export const ClashProxiesSchema = z.object({
  proxies: z.record(z.string(), ClashProxySchema),
});

/** Zeros in `Total` and `Expire` mean "the subscription did not report a limit", not "exhausted". */
export const ClashSubscriptionInfoSchema = z.object({
  Upload: z.number(),
  Download: z.number(),
  Total: z.number(),
  Expire: z.number(),
});

export const ClashProviderSchema = z.object({
  type: z.string(),
  vehicleType: z.string(),
  name: z.string(),
  proxies: z.array(ClashProxySchema),
  updatedAt: z.string(),
  subscriptionInfo: ClashSubscriptionInfoSchema.optional(),
});

export const ClashProvidersSchema = z.object({
  providers: z.record(z.string(), ClashProviderSchema),
});

export type ClashDelayWire = z.infer<typeof ClashDelaySchema>;
export type ClashProxyWire = z.infer<typeof ClashProxySchema>;
export type ClashProxiesWire = z.infer<typeof ClashProxiesSchema>;
export type ClashSubscriptionInfoWire = z.infer<typeof ClashSubscriptionInfoSchema>;
export type ClashProvidersWire = z.infer<typeof ClashProvidersSchema>;
