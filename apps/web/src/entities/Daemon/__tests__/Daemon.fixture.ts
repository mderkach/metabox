import type { DaemonStatus } from '../api/Daemon.api';
import type { ClashConfigs, ClashVersion, ServiceState } from '../api/Daemon.dto';

/** Демон отвечает и применений в работе нет: поле `transaction` пустое. */
export const DAEMON_STATUS_FIXTURE: DaemonStatus = {
  version: '1.13.18-extended-2.6.5',
  config_path: '/etc/sing-box/config.json',
};

/** Версия и режим, снятые с устройства 2026-09-10. */

export const CLASH_VERSION_FIXTURE: ClashVersion = {
  meta: true,
  premium: true,
  version: 'sing-box 1.13.18-extended-2.6.5',
};

export const CLASH_CONFIGS_FIXTURE: ClashConfigs = {
  mode: 'Rule',
  'mode-list': ['Rule', 'Global', 'Direct'],
  'log-level': 'error',
  'allow-lan': false,
  'bind-address': '*',
  ipv6: false,
};

/** Первый сэмпл памяти на устройстве нулевой (PRD, OQ-5) — мок это повторяет. */
export const MEMORY_SAMPLES = [0, 47_923_200, 51_380_224];

/** Сервис поднят: аптайм снят с устройства 2026-09-10. */
export const SERVICE_RUNNING_FIXTURE: ServiceState = {
  status: 'running',
  uptime: 253_091,
  binary: '1.13.18-extended-2.6.5',
  schema: '1.13.18-extended-2.6.5',
};

/** Сервис упал: вывод procd показывается дословно, разбирать его нельзя. */
export const SERVICE_FAILED_FIXTURE: ServiceState = {
  status: 'failed',
  uptime: 0,
  binary: '1.13.18-extended-2.6.5',
  schema: '1.13.18-extended-2.6.5',
  lastError:
    'FATAL[0000] start service: initialize outbound/urltest[proxy]: provider sub-nl not found\nprocd: instance sing-box::instance1 exit code 1, restart in 5s',
};

/** Бинарь новее схемы: панель обязана продолжать работать (UX-4, AC-28). */
export const SERVICE_DRIFT_FIXTURE: ServiceState = {
  status: 'running',
  uptime: 120,
  binary: '1.13.19-extended-2.6.6',
  schema: '1.13.18-extended-2.6.5',
};
