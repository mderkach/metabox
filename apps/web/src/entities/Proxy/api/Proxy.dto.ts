/**
 * Ответы Clash API по прокси. Демон отдаёт их дословно, поэтому имена полей
 * здесь чужие: они приходят такими по проводу.
 */

/** Замер задержки. `delay: 65535` — узел не ответил, а не «очень медленно». */
export interface ClashDelay {
  time: string;
  delay: number;
}

/**
 * Узел или группа: различаются только полями `now` и `all`, отдельного типа
 * у Clash API нет. Группы — `Selector`, `URLTest`, `Fallback`, `LoadBalance`.
 */
export interface ClashProxy {
  type: string;
  name: string;
  udp: boolean;
  history: ClashDelay[];
  now?: string;
  all?: string[];
}

export interface ClashProxies {
  proxies: Record<string, ClashProxy>;
}

/** Нули в `Total` и `Expire` значат «подписка не сообщила лимит», а не «исчерпана». */
export interface ClashSubscriptionInfo {
  Upload: number;
  Download: number;
  Total: number;
  Expire: number;
}

export interface ClashProvider {
  type: string;
  vehicleType: string;
  name: string;
  proxies: ClashProxy[];
  updatedAt: string;
  subscriptionInfo?: ClashSubscriptionInfo;
}

export interface ClashProviders {
  providers: Record<string, ClashProvider>;
}
