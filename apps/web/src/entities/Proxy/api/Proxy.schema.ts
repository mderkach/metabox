import { z } from 'zod';

/**
 * Ответы Clash API по прокси. Демон отдаёт их дословно, поэтому имена полей
 * здесь чужие: они приходят такими по проводу.
 */
export const ClashDelaySchema = z.object({
  time: z.string(),
  /** `delay: 65535` — узел не ответил, а не «очень медленно». */
  delay: z.number(),
});

/**
 * Узел или группа: различаются только полями `now` и `all`, отдельного типа
 * у Clash API нет. Группы — `Selector`, `URLTest`, `Fallback`, `LoadBalance`.
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

/** Нули в `Total` и `Expire` значат «подписка не сообщила лимит», а не «исчерпана». */
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
export type ClashProvidersWire = z.infer<typeof ClashProvidersSchema>;
