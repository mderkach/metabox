import { APPLY_REASON_CODE, SERVICE_ERROR_CODE } from '../api/Daemon.schema';

/** Apply stage. Values come from the daemon (`apply.Phase`). */
export const APPLY_PHASE = {
  Applying: 'applying',
  AwaitingConfirm: 'awaiting_confirm',
  Confirmed: 'confirmed',
  RolledBack: 'rolled_back',
  Failed: 'failed',
} as const;

export type ApplyPhase = (typeof APPLY_PHASE)[keyof typeof APPLY_PHASE];

/** Apply cycle step codes: the set is declared by the daemon and arrives as a contract. */
export type ApplyReasonCode = (typeof APPLY_REASON_CODE)[number];

/** Apply snapshot, `apply.Transaction`. */
export interface ApplyTransaction {
  id: string;
  phase: ApplyPhase;
  /** Remaining confirmation window in nanoseconds: Go serves `time.Duration`. */
  window: number;
  sum?: string;
  /** The step the cycle stopped at; the panel takes the failure text by the code. */
  reasonCode?: ApplyReasonCode;
  /** Original step error in the daemon's words: fallback text and detail for whoever fixes it. */
  reason?: string;
  /** The daemon appended a Clash API section to the config to read the runtime. */
  clashApiAdded?: boolean;
}

/** Daemon state: `GET /api/status`. */
export interface DaemonStatus {
  /** Daemon version, not sing-box: the binary is served in a separate field. */
  version: string;
  /** sing-box version on the device; empty if the daemon did not read it. */
  singboxVersion?: string;
  /**
   * Binary build tags. `null` means the binary was not read, and there is
   * nothing to judge the build contents by; an empty list is a build without
   * tags.
   */
  singboxTags: readonly string[] | null;
  /** A file owned by the daemon: the path is set by its launch flags. */
  configPath?: string;
  /** How long an apply waits for confirmation before the rollback: set by the daemon's launch flag. */
  confirmWindowSeconds: number;
  transaction?: ApplyTransaction;
  transactionHref?: string;
  /** Last dataplane model change: the same protocol as config apply, and not run at the same time as it. */
  dataplaneTransaction?: ApplyTransaction;
}

/** sing-box service state: `procd` knows only these three states. */
export const SERVICE_STATUS = {
  Running: 'running',
  Stopped: 'stopped',
  Failed: 'failed',
} as const;

export type ServiceStatus = (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

/** Service state read failure codes: the set is declared by the daemon and arrives as a contract. */
export type ServiceErrorCode = (typeof SERVICE_ERROR_CODE)[number];

export interface ServiceState {
  status: ServiceStatus;
  /** Seconds since start; `0` when the service is not running. */
  uptime: number;
  /**
   * The process is owned by the service the daemon manages. False with the
   * "running" status means sing-box was started outside that service: panel
   * commands do not apply to that process, and procd does not know its age.
   */
  managed: boolean;
  /** Version of the sing-box binary installed on the device. */
  binary: string;
  /**
   * Output of the last crash or, with `lastErrorCode`, the daemon error in the
   * daemon's words. Shown verbatim, it must not be parsed.
   */
  lastError?: string;
  /** The state is substituted by the daemon, not read; the panel takes the text by the code. */
  lastErrorCode?: ServiceErrorCode;
}

/**
 * Service state that the daemon read, not substituted. `null` means the state
 * is unknown: on a read failure the daemon serves `stopped` with a reason code,
 * and such a response must not be passed off as a stop, since one failed procd
 * read would show a running sing-box as down.
 */
export function toConfirmedStatus(state: ServiceState): ServiceStatus | null {
  return state.lastErrorCode === undefined ? state.status : null;
}

/** Service actions: `POST /api/service/{action}`. */
export const SERVICE_ACTION = {
  Start: 'start',
  Stop: 'stop',
  Restart: 'restart',
} as const;

export type ServiceAction = (typeof SERVICE_ACTION)[keyof typeof SERVICE_ACTION];

/** Clash API routing mode; the `clash_mode` rule in the config is matched against it. */
export interface ClashConfigs {
  /**
   * Modes are not a closed set: sing-box builds the list from `clash_mode`
   * values in the config rules and adds the default mode to them.
   */
  mode: string;
  modeList: string[];
  logLevel: string;
  allowLan: boolean;
  bindAddress: string;
  ipv6: boolean;
}

/** Instantaneous speed over the last second, not an accumulating counter. */
export interface TrafficSample {
  up: number;
  down: number;
}

/**
 * The first stream sample is always zero, and the fork does not fill `oslimit`.
 * The screen must survive a zero first frame, not show "memory 0".
 */
export interface MemorySample {
  inuse: number;
  oslimit: number;
}

/** Load average: a run queue, not percent. */
export interface SystemLoad {
  one: number;
  five: number;
  fifteen: number;
  /** How many cores the system sees: without this number the load is unreadable. */
  cores: number;
}

export interface SystemMemory {
  total: number;
  available: number;
}

/** Board thermal zone; degrees are already converted from thousandths of the kernel's. */
export interface ThermalZone {
  name: string;
  celsius: number;
}

/** Counters of the interface the device uses to go outward, in bytes since link up. */
export interface SystemUplink {
  name: string;
  rx: number;
  tx: number;
}

export interface SystemProcess {
  pid: number;
  /**
   * Resident memory of the process. For sing-box it is larger than what the
   * Clash API serves: that counts only Go runtime memory, while this includes
   * the resident binary code, which for a static sing-box is tens of megabytes.
   */
  rss: number;
}

export interface DaemonProcess {
  rss: number;
  heap: number;
  goroutines: number;
}

/** Device readings: the `system` topic of the single stream. */
export interface SystemStat {
  load: SystemLoad;
  memory: SystemMemory;
  thermal: ThermalZone[];
  uplink?: SystemUplink;
  /** Channel and sing-box volumes over the daemon observation time. */
  share: TrafficShare;
  /** Empty when the routing process is not found on the device. */
  singbox?: SystemProcess;
  daemon: DaemonProcess;
  /** Seconds since the device booted. */
  uptime: number;
}

/**
 * Traffic history from the daemon: points go in sequence with step
 * `stepSeconds`, the last one is the newest. A point has no absolute time: the
 * router has no clock before NTP sync, and the panel computes axis labels on
 * its own.
 */
export interface TrafficHistory {
  stepSeconds: number;
  points: TrafficSample[];
  /** Step of `device`: the board ring coarsens apart from the traffic one. */
  deviceStepSeconds: number;
  /** Board readings with step `deviceStepSeconds`: load, temperature, used memory. */
  device: DeviceHistoryPoint[];
  /** Last minute of traffic by the second: the chart is filled with it on open. */
  recent: TrafficSample[];
  /** Number of live connections over the last minute, one snapshot per second. */
  connections: number[];
}

/** Load and temperature are the step peak, memory is the step average. */
export interface DeviceHistoryPoint {
  load: number;
  /** Hottest board zone; zero means there are no zones. */
  celsius: number;
  memory: number;
  /** Resident memory of sing-box; zero means the process is not found. */
  singbox: number;
  /** Resident memory of the daemon. */
  daemon: number;
}

/** Interface speed over the interval between snapshots, bytes per second. */
export interface UplinkRate {
  rx: number;
  tx: number;
}

/**
 * How many bytes passed through the channel and through sing-box over the observation time.
 *
 * Increments are accumulated by the daemon: the interface counter runs since
 * link up, the Clash API counter since process start, and they can be compared
 * only over a common window. A per-second ratio does not fit: it jumps on every
 * burst.
 */
export interface TrafficShare {
  link: number;
  proxy: number;
  /** Observation seconds: they show what window the share is computed over. */
  seconds: number;
}
