/** Задержка, при которой узел считается недоступным: sing-box отдаёт 65535. */
export const DELAY_TIMEOUT = 65_535;

/**
 * Граница «быстро», миллисекунды: порог, при котором переключение узла ещё не
 * заметно. Экраны называют её в легенде тона — иначе 290 и 310 мс разного
 * цвета выглядят случайностью.
 */
export const DELAY_FAST = 300;

export const DELAY_STATE = {
  Fast: 'fast',
  Slow: 'slow',
  Failed: 'failed',
  Unknown: 'unknown',
} as const;

export type DelayState = (typeof DELAY_STATE)[keyof typeof DELAY_STATE];

/** Типы групп Clash API: у них есть `all`, у остальных узлов — нет. */
export const GROUP_TYPES: ReadonlySet<string> = new Set(['Selector', 'URLTest', 'Fallback', 'LoadBalance']);

/**
 * Служебные группы Clash API. В конфиге их не существует, а переключение
 * `GLOBAL` перевело бы весь трафик мимо правил.
 */
export const SERVICE_GROUPS: ReadonlySet<string> = new Set(['GLOBAL', 'DIRECT', 'REJECT']);

export interface ProxyNode {
  name: string;
  type: string;
  /** `null` — узел ни разу не проверяли. */
  delay: number | null;
  delayState: DelayState;
  /** Узел выбран группой прямо сейчас. */
  selected: boolean;
}

export interface ProxyGroup {
  name: string;
  type: string;
  /** Узел выбирает пользователь только у селектора; URL-тест решает сам. */
  selectable: boolean;
  now: string | null;
  nodes: ProxyNode[];
}

/** Группировка живёт в модели: её же использует оптимистичное обновление выбора. */
export interface ProxyRuntime {
  groups: ProxyGroup[];
  standalone: ProxyNode[];
}

/**
 * Когда подписка обновлялась. `never` — рантайм отдал нулевую дату Go
 * (`0001-01-01…`) или эпоху: подписку ещё не загружали. `unknown` — строка не
 * разобралась как дата; схема формат не проверяет.
 */
export type ProviderUpdate =
  | { kind: 'never' }
  | { kind: 'unknown'; raw: string }
  | { kind: 'at'; at: Date; raw: string };

export interface ProviderUsage {
  /** Upload + Download. */
  used: number;
  /** `0` — подписка лимит не сообщила. */
  total: number;
}

export interface ProxyProvider {
  name: string;
  nodes: number;
  update: ProviderUpdate;
  /** `null`, когда подписка не прислала `subscription-userinfo` или в нём одни нули. */
  usage: ProviderUsage | null;
  /** `null`, когда срок не сообщён. */
  expiresAt: Date | null;
}
