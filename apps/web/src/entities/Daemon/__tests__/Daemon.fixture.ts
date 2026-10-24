import type {
  ClashConfigsWire,
  DaemonStatusWire,
  ServiceStateWire,
  SystemStatWire,
  TrafficHistoryWire,
} from '../api/Daemon.schema';

/** The daemon responds and no applies are in progress: the `transaction` field is empty. */
export const DAEMON_STATUS_FIXTURE: DaemonStatusWire = {
  version: 'dev',
  singbox_version: '1.14.1-extended-2.7.2',
  // Binary tags on the device, `sing-box version` 2026-09-23: ccm, ocm,
  // cloudflared, naive, usbip, openvpn and openconnect are not in the build.
  singbox_build: {
    tags: [
      'with_gvisor',
      'with_quic',
      'with_dhcp',
      'with_wireguard',
      'with_utls',
      'with_acme',
      'with_clash_api',
      'with_tailscale',
      'with_masque',
      'with_mtproxy',
      'with_trusttunnel',
      'with_call',
      'with_sudoku',
      'with_manager',
      'with_admin_panel',
      'with_profiler',
      'badlinkname',
      'tfogo_checklinkname0',
    ],
  },
  config_path: '/etc/sing-box/config.json',
  confirm_window_seconds: 60,
  runtime: { sources: ['clash_api'], connections: 'clash_api' },
};

/** Version and mode taken from the device on 2026-09-10. */

export const CLASH_CONFIGS_FIXTURE: ClashConfigsWire = {
  mode: 'Rule',
  'mode-list': ['Rule', 'Global', 'Direct'],
  'log-level': 'error',
  'allow-lan': false,
  'bind-address': '*',
  ipv6: false,
};

/** The first memory sample on the device is zero: the mock repeats this. */
export const MEMORY_SAMPLES = [0, 47_923_200, 51_380_224];

/** Traffic sample: measured on the device on 2026-09-10, bytes per second. */
export const TRAFFIC_SAMPLE = { up: 8500, down: 43_400 };

/** Service is up: uptime taken from the device on 2026-09-10. */
export const SERVICE_RUNNING_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 253_091,
  binary: '1.14.1-extended-2.7.2',
  managed: true,
};

/**
 * The process is alive but was not started by the daemon service: on the device routing
 * is owned by a foreign package, and procd does not know the process age.
 */
export const SERVICE_UNMANAGED_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 0,
  binary: '1.14.1-extended-2.7.2',
  managed: false,
};

/** Service crashed: the procd output is shown verbatim, it must not be parsed. */
export const SERVICE_FAILED_FIXTURE: ServiceStateWire = {
  status: 'failed',
  uptime: 0,
  binary: '1.14.1-extended-2.7.2',
  managed: false,
  lastError:
    'FATAL[0000] start service: initialize outbound/urltest[proxy]: provider sub-nl not found\nprocd: instance sing-box::instance1 exit code 1, restart in 5s',
};

/** procd did not answer the daemon: the status is substituted, the daemon text goes as detail to the code. */
export const SERVICE_UNREAD_FIXTURE: ServiceStateWire = {
  status: 'stopped',
  uptime: 0,
  binary: '1.14.1-extended-2.7.2',
  managed: false,
  lastError: 'состояние сервиса не прочитано',
  lastErrorCode: 'service_state_unread',
};

/** Binary newer than the schema: the panel must keep working. */
export const SERVICE_DRIFT_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 120,
  binary: '1.13.19-extended-2.6.6',
  managed: true,
};

/** Traffic history: ten-second step, forty points, as the daemon serves it. */
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
    singbox: 88_000_000 + index * 150_000,
    daemon: 14_000_000,
  })),
  connections: Array.from({ length: 60 }, (_, index) => 150 + ((index * 7) % 13)),
  recent: Array.from({ length: 60 }, (_, index) => ({
    down: 40_000 + ((index * 13) % 17) * 1200,
    up: 6000 + ((index * 7) % 11) * 300,
  })),
};

/** Device readings: taken on a BPI-R4 Pro on 2026-09-13. */
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
