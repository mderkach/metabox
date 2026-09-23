import { APPLY_REASON_CODE } from '../api/Daemon.schema';

/** Стадия применения. Значения приходят с демона (`apply.Phase`). */
export const APPLY_PHASE = {
  Applying: 'applying',
  AwaitingConfirm: 'awaiting_confirm',
  Confirmed: 'confirmed',
  RolledBack: 'rolled_back',
  Failed: 'failed',
} as const;

export type ApplyPhase = (typeof APPLY_PHASE)[keyof typeof APPLY_PHASE];

/** Коды шагов цикла применения — набор объявлен демоном и приезжает контрактом. */
export type ApplyReasonCode = (typeof APPLY_REASON_CODE)[number];

/** Снимок применения — `apply.Transaction`. */
export interface ApplyTransaction {
  id: string;
  phase: ApplyPhase;
  /** Остаток окна подтверждения в наносекундах: Go отдаёт `time.Duration`. */
  window: number;
  sum?: string;
  /** На каком шаге встал цикл; по коду панель берёт текст отказа. */
  reasonCode?: ApplyReasonCode;
  /** Исходная ошибка шага словами демона: запасной текст и подробность для того, кто чинит. */
  reason?: string;
  /** Демон дописал в конфиг секцию Clash API, чтобы читать рантайм. */
  clashApiAdded?: boolean;
}

/** Состояние демона: `GET /api/status`. */
export interface DaemonStatus {
  /** Версия демона, а не sing-box: бинарь отдаётся отдельным полем. */
  version: string;
  /** Версия sing-box на устройстве; пусто, если демон её не прочитал. */
  singboxVersion?: string;
  /**
   * Build-теги бинаря. `null` — бинарь не прочитан, и судить о составе
   * сборки не по чему; пустой список — сборка без тегов.
   */
  singboxTags: readonly string[] | null;
  /** Файл, которым владеет демон: путь задаётся флагами его запуска. */
  configPath?: string;
  transaction?: ApplyTransaction;
  transactionHref?: string;
}

/** Состояние службы sing-box: `procd` знает только эти три состояния (ADR-0009). */
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
  /**
   * Процессом владеет служба, которой управляет демон. Ложь при статусе
   * «работает» означает, что sing-box поднят чужой службой: команды панели к
   * этому процессу не относятся, а возраст его procd не знает.
   */
  managed: boolean;
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
export interface ClashConfigs {
  /**
   * Режимы не закрытый набор: sing-box собирает список из значений
   * `clash_mode` в правилах конфига и добавляет к ним режим по умолчанию.
   */
  mode: string;
  modeList: string[];
  logLevel: string;
  allowLan: boolean;
  bindAddress: string;
  ipv6: boolean;
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

/** Средняя загрузка: очередь на выполнение, а не проценты. */
export interface SystemLoad {
  one: number;
  five: number;
  fifteen: number;
  /** Сколько ядер видит система: без этого числа загрузка не читается. */
  cores: number;
}

export interface SystemMemory {
  total: number;
  available: number;
}

/** Термозона платы; градусы уже переведены из тысячных долей ядра. */
export interface ThermalZone {
  name: string;
  celsius: number;
}

/** Счётчики интерфейса, которым устройство ходит наружу, в байтах с подъёма линка. */
export interface SystemUplink {
  name: string;
  rx: number;
  tx: number;
}

export interface SystemProcess {
  pid: number;
  /**
   * Резидентная память процесса. У sing-box она больше того, что отдаёт Clash
   * API: тот считает только память рантайма Go, а сюда входит и резидентный
   * код бинаря — у статического sing-box это десятки мегабайт.
   */
  rss: number;
}

export interface DaemonProcess {
  rss: number;
  heap: number;
  goroutines: number;
}

/** Показания устройства: топик `system` единого потока. */
export interface SystemStat {
  load: SystemLoad;
  memory: SystemMemory;
  thermal: ThermalZone[];
  uplink?: SystemUplink;
  /** Объёмы канала и sing-box за время наблюдения демона. */
  share: TrafficShare;
  /** Пусто, когда процесс маршрутизации на устройстве не найден. */
  singbox?: SystemProcess;
  daemon: DaemonProcess;
  /** Секунды с загрузки устройства. */
  uptime: number;
}

/**
 * История трафика с демона: точки идут подряд с шагом `stepSeconds`, последняя
 * самая свежая. Абсолютного времени у точки нет — часов у роутера до
 * синхронизации NTP не существует, и подписи оси панель считает по своим.
 */
export interface TrafficHistory {
  stepSeconds: number;
  points: TrafficSample[];
  /** Показания платы тем же шагом: загрузка, температура, занятая память. */
  device: DeviceHistoryPoint[];
  /** Последняя минута трафика по секунде: ею график заполняется при открытии. */
  recent: TrafficSample[];
  /** Число живых соединений за последнюю минуту, по снимку в секунду. */
  connections: number[];
}

/** Загрузка и температура — пик шага, память — среднее за шаг. */
export interface DeviceHistoryPoint {
  load: number;
  /** Самая горячая зона платы; ноль означает, что зон нет. */
  celsius: number;
  memory: number;
  /** Резидентная память sing-box; ноль — процесс не найден. */
  singbox: number;
  /** Резидентная память демона. */
  daemon: number;
}

/** Скорость интерфейса за интервал между снимками, байт в секунду. */
export interface UplinkRate {
  rx: number;
  tx: number;
}

/**
 * Сколько байт прошло через канал и через sing-box за время наблюдения.
 *
 * Приращения копит демон: счётчик интерфейса идёт с подъёма линка, счётчик
 * Clash API — с запуска процесса, и сравнивать их можно только за общее окно.
 * Секундное отношение для этого не годится — оно прыгает от каждого всплеска.
 */
export interface TrafficShare {
  link: number;
  proxy: number;
  /** Секунды наблюдения: по ним видно, за какое окно посчитана доля. */
  seconds: number;
}
