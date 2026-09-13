import type {
  ClashConfigsWire,
  DaemonStatusWire,
  ServiceStateWire,
  SystemStatWire,
  TrafficHistoryWire,
} from '../api/Daemon.schema';

/** Демон отвечает и применений в работе нет: поле `transaction` пустое. */
export const DAEMON_STATUS_FIXTURE: DaemonStatusWire = {
  version: 'dev',
  singbox_version: '1.14.0-extended-2.7.1',
  config_path: '/etc/sing-box/config.json',
};

/** Версия и режим, снятые с устройства 2026-09-10. */

export const CLASH_CONFIGS_FIXTURE: ClashConfigsWire = {
  mode: 'Rule',
  'mode-list': ['Rule', 'Global', 'Direct'],
  'log-level': 'error',
  'allow-lan': false,
  'bind-address': '*',
  ipv6: false,
};

/** Первый сэмпл памяти на устройстве нулевой (PRD, OQ-5) — мок это повторяет. */
export const MEMORY_SAMPLES = [0, 47_923_200, 51_380_224];

/** Сэмпл трафика: замер на устройстве 2026-09-10, байты в секунду. */
export const TRAFFIC_SAMPLE = { up: 8500, down: 43_400 };

/** Сервис поднят: аптайм снят с устройства 2026-09-10. */
export const SERVICE_RUNNING_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 253_091,
  binary: '1.14.0-extended-2.7.1',
  managed: true,
};

/**
 * Процесс жив, но поднят не службой демона: на устройстве маршрутизацией
 * владеет чужой пакет, и возраст процесса procd не знает.
 */
export const SERVICE_UNMANAGED_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 0,
  binary: '1.14.0-extended-2.7.1',
  managed: false,
};

/** Сервис упал: вывод procd показывается дословно, разбирать его нельзя. */
export const SERVICE_FAILED_FIXTURE: ServiceStateWire = {
  status: 'failed',
  uptime: 0,
  binary: '1.14.0-extended-2.7.1',
  managed: false,
  lastError:
    'FATAL[0000] start service: initialize outbound/urltest[proxy]: provider sub-nl not found\nprocd: instance sing-box::instance1 exit code 1, restart in 5s',
};

/** Бинарь новее схемы: панель обязана продолжать работать (UX-4, AC-28). */
export const SERVICE_DRIFT_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 120,
  binary: '1.13.19-extended-2.6.6',
  managed: true,
};

/** История трафика: шаг десять секунд, сорок точек — как отдаёт демон. */
export const TRAFFIC_HISTORY_FIXTURE: TrafficHistoryWire = {
  step_seconds: 10,
  points: Array.from({ length: 40 }, (_, index) => ({
    down: 40_000 + index * 900,
    up: 6000 + ((index * 7) % 11) * 400,
  })),
  device: Array.from({ length: 40 }, (_, index) => ({
    load: 0.1 + ((index * 3) % 7) / 10,
    celsius: 41 + ((index * 5) % 9) / 3,
    memory: 350_000_000 + index * 1_200_000,
  })),
};

/** Показания устройства: снято на BPI-R4 Pro 2026-09-13. */
export const SYSTEM_FIXTURE: SystemStatWire = {
  load: { one: 0.49, five: 0.33, fifteen: 0.18, cores: 4 },
  memory: { total: 8_332_603_392, available: 7_962_783_744 },
  thermal: [{ name: 'cpu-thermal', milli: 42_578 }],
  uplink: { name: 'pppoe-wan', rx: 9_394_995_569, tx: 1_413_850_120 },
  share: { link: 254_803_968, proxy: 48_412_672, seconds: 612 },
  singbox: { pid: 5872, rss: 85_913_600 },
  daemon: { rss: 12_582_912, heap: 5_242_880, goroutines: 38 },
  uptime: 68_239,
};
