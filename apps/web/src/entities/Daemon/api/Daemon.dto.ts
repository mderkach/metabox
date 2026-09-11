/** Режим маршрутизации Clash API; правило `clash_mode` в конфиге сверяется с ним. */
export type ClashMode = 'Rule' | 'Global' | 'Direct';

export interface ClashVersion {
  meta: boolean;
  premium: boolean;
  version: string;
}

export interface ClashConfigs {
  mode: ClashMode;
  'mode-list': ClashMode[];
  'log-level': string;
  'allow-lan': boolean;
  'bind-address': string;
  ipv6: boolean;
}

/** Мгновенная скорость за последнюю секунду, а не накопительный счётчик. */
export interface ClashTrafficSample {
  up: number;
  down: number;
}

/**
 * Первый сэмпл потока всегда нулевой, а `oslimit` форк не заполняет. Экран
 * обязан пережить нулевой первый кадр, а не показать «памяти 0».
 */
export interface ClashMemorySample {
  inuse: number;
  oslimit: number;
}

/** Состояние сервиса sing-box: `GET /api/service`. */
export interface ServiceState {
  /** `running` — procd поднял процесс; `stopped` — не запущен; `failed` — упал. */
  status: 'running' | 'stopped' | 'failed';
  /** Секунды с момента старта; `0`, когда сервис не запущен. */
  uptime: number;
  /** Версия установленного на устройстве бинаря sing-box. */
  binary: string;
  /** Вывод последнего падения: показывается дословно, разбирать его нельзя. */
  lastError?: string;
}

/** Действия над сервисом: `POST /api/service/{action}`. */
export const SERVICE_ACTION = {
  Start: 'start',
  Stop: 'stop',
  Restart: 'restart',
} as const;

export type ServiceAction = (typeof SERVICE_ACTION)[keyof typeof SERVICE_ACTION];
