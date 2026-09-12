/** Стадия применения. Значения приходят с демона (`apply.Phase`). */
export const APPLY_PHASE = {
  Applying: 'applying',
  AwaitingConfirm: 'awaiting_confirm',
  Confirmed: 'confirmed',
  RolledBack: 'rolled_back',
  Failed: 'failed',
} as const;

export type ApplyPhase = (typeof APPLY_PHASE)[keyof typeof APPLY_PHASE];

/** Снимок применения — `apply.Transaction`. */
export interface ApplyTransaction {
  id: string;
  phase: ApplyPhase;
  /** Остаток окна подтверждения в наносекундах: Go отдаёт `time.Duration`. */
  window: number;
  sum?: string;
  reason?: string;
  /** Демон дописал в конфиг секцию Clash API, чтобы читать рантайм (AC-31). */
  clashApiAdded?: boolean;
}

/** Состояние демона: `GET /api/status`. */
export interface DaemonStatus {
  /** Версия демона, а не sing-box: бинарь отдаётся отдельным полем. */
  version: string;
  /** Версия sing-box на устройстве; пусто, если демон её не прочитал. */
  singboxVersion?: string;
  /** Файл, которым владеет демон: путь задаётся флагами его запуска. */
  configPath?: string;
  transaction?: ApplyTransaction;
  transactionHref?: string;
}

/** Состояние службы sing-box: `procd` знает только эти три исхода (ADR-0009). */
export const SERVICE_STATUS = {
  Running: 'running',
  Stopped: 'stopped',
  Failed: 'failed',
} as const;

export type ServiceStatus = (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

export interface ServiceState {
  status: ServiceStatus;
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

/** Режим маршрутизации Clash API; правило `clash_mode` в конфиге сверяется с ним. */
export const CLASH_MODE = {
  Rule: 'Rule',
  Global: 'Global',
  Direct: 'Direct',
} as const;

export type ClashMode = (typeof CLASH_MODE)[keyof typeof CLASH_MODE];

export interface ClashConfigs {
  mode: ClashMode;
  modeList: ClashMode[];
  logLevel: string;
  allowLan: boolean;
  bindAddress: string;
  ipv6: boolean;
}

export interface ClashVersion {
  meta: boolean;
  premium: boolean;
  version: string;
}

/** Мгновенная скорость за последнюю секунду, а не накопительный счётчик. */
export interface TrafficSample {
  up: number;
  down: number;
}

/**
 * Первый сэмпл потока всегда нулевой, а `oslimit` форк не заполняет. Экран
 * обязан пережить нулевой первый кадр, а не показать «памяти 0».
 */
export interface MemorySample {
  inuse: number;
  oslimit: number;
}
