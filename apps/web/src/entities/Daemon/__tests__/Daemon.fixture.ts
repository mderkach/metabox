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
  instance: 'MOCKINSTANCE00000000000000',
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

/**
 * A minute of the traffic stream taken on the BPI-R4 Pro on 2026-11-12: bursts of
 * hundreds of kilobytes between quiet seconds. The dev mock cycles it, otherwise
 * the chart is a flat line and a break in it cannot be seen.
 */
export const TRAFFIC_STREAM_SAMPLES = [
  { down: 15603, up: 2034 },
  { down: 18480, up: 4823 },
  { down: 24118, up: 25896 },
  { down: 16849, up: 32188 },
  { down: 16691, up: 3214 },
  { down: 17589, up: 535 },
  { down: 14618, up: 606 },
  { down: 15625, up: 24929 },
  { down: 12890, up: 464 },
  { down: 8158, up: 4018 },
  { down: 14855, up: 376 },
  { down: 15950, up: 5255 },
  { down: 14593, up: 936 },
  { down: 6994, up: 2456 },
  { down: 24213, up: 2531 },
  { down: 25735, up: 626155 },
  { down: 16001, up: 8829 },
  { down: 17390, up: 5912 },
  { down: 26409, up: 1976 },
  { down: 21795, up: 546 },
  { down: 19032, up: 1128 },
  { down: 19810, up: 458 },
  { down: 24894, up: 14746 },
  { down: 26162, up: 557 },
  { down: 22807, up: 623 },
  { down: 17411, up: 598 },
  { down: 19567, up: 2668 },
  { down: 25134, up: 27804 },
  { down: 23581, up: 33397 },
  { down: 28030, up: 17622 },
  { down: 36466, up: 63683 },
  { down: 18277, up: 602 },
  { down: 24494, up: 934 },
  { down: 25206, up: 33301 },
  { down: 23876, up: 30278 },
  { down: 24712, up: 28998 },
  { down: 157395, up: 719 },
  { down: 534504, up: 749 },
  { down: 17608, up: 568 },
  { down: 15286, up: 571 },
  { down: 19141, up: 7401 },
  { down: 27944, up: 672 },
  { down: 38314, up: 48184 },
  { down: 25158, up: 494 },
  { down: 26174, up: 79257 },
  { down: 38589, up: 77724 },
  { down: 27223, up: 27389 },
  { down: 21573, up: 48192 },
  { down: 27491, up: 529 },
  { down: 29465, up: 833 },
  { down: 24115, up: 25860 },
  { down: 20143, up: 648 },
  { down: 16375, up: 7875 },
  { down: 14597, up: 498 },
  { down: 17959, up: 2500 },
  { down: 26037, up: 434 },
  { down: 27811, up: 683 },
  { down: 26447, up: 725 },
  { down: 22272, up: 22804 },
  { down: 27277, up: 12580 },
];

/** Service is up: uptime taken from the device on 2026-09-10. */
export const SERVICE_RUNNING_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 253_091,
  binary: '1.14.1-extended-2.7.2',
  managed: true,
};

/**
 * The process is alive but was not started by the daemon service, so procd does not know
 * the process age.
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
  lastError: 'service state not read',
  lastErrorCode: 'service_state_unread',
};

/** Binary newer than the schema: the panel must keep working. */
export const SERVICE_DRIFT_FIXTURE: ServiceStateWire = {
  status: 'running',
  uptime: 120,
  binary: '1.13.19-extended-2.6.6',
  managed: true,
};

/**
 * Traffic history: forty points, as the daemon serves it. The board step differs from the traffic
 * one, as after a doubling only one of the rings went through.
 */
export const TRAFFIC_HISTORY_FIXTURE: TrafficHistoryWire = {
  step_seconds: 10,
  device_step_seconds: 20,
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
  share: {
    link: 254_803_968,
    proxy: 48_412_672,
    split: { proxy: 31_457_280, direct: 16_955_392, block: 0 },
    seconds: 612,
  },
  singbox: { pid: 5872, rss: 85_913_600 },
  daemon: { rss: 12_582_912, heap: 5_242_880, goroutines: 38 },
  uptime: 68_239,
};
