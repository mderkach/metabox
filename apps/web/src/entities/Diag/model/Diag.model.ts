import { CHECK_NAME, CHECK_REASON, CHECK_STATUS } from '../api/Diag.schema';

export type CheckName = (typeof CHECK_NAME)[number];

export type CheckStatus = (typeof CHECK_STATUS)[number];

export type CheckReason = (typeof CHECK_REASON)[number];

export const DIAG_STATUS = {
  Ok: 'ok',
  Fail: 'fail',
  Skipped: 'skipped',
} as const satisfies Record<string, CheckStatus>;

export interface DiagCheck {
  /** A string, not `CheckName`: a check the panel does not know is shown as it came. */
  name: string;
  status: CheckStatus;
  /** `null` when `ok`. A string, not `CheckReason`: an unfamiliar code is shown as is. */
  reason: string | null;
  /** Detail in the daemon's language: a port, the original error; goes under the panel text, not instead of it. */
  detail: string | null;
  /** Missing nft chains for `chains_missing`. */
  missing: string[];
  /** Latency in milliseconds for `ok` on the exit through a node and the direct exit. */
  delayMs: number | null;
}

export function isCheckName(value: string): value is CheckName {
  return CHECK_NAME.some((name) => name === value);
}

export function isCheckReason(value: string): value is CheckReason {
  return CHECK_REASON.some((reason) => reason === value);
}

export function isCheckStatus(value: string): value is CheckStatus {
  return CHECK_STATUS.some((status) => status === value);
}

/** What a check speaks for: the overview shows areas, the diagnostics screen the checks themselves. */
export const DIAG_AREA = {
  Interception: 'interception',
  Dns: 'dns',
  Proxy: 'proxy',
  Direct: 'direct',
} as const;

export type DiagArea = (typeof DIAG_AREA)[keyof typeof DIAG_AREA];

/** A new daemon check is a compile error here until it is given an area. */
const CHECK_AREA: Readonly<Record<CheckName, DiagArea>> = {
  redirect_port: DIAG_AREA.Interception,
  tproxy_port: DIAG_AREA.Interception,
  nft_chains: DIAG_AREA.Interception,
  dns_port: DIAG_AREA.Dns,
  dns_probe: DIAG_AREA.Dns,
  proxy: DIAG_AREA.Proxy,
  direct: DIAG_AREA.Direct,
};

const AREA_ORDER: readonly DiagArea[] = [DIAG_AREA.Interception, DIAG_AREA.Dns, DIAG_AREA.Proxy, DIAG_AREA.Direct];

export interface DiagAreaResult {
  area: DiagArea;
  /** One failed check fails the area; skipped checks do not make it pass. */
  status: CheckStatus;
  /** Latency of the exit when the area is an exit and it passed. */
  delayMs: number | null;
}

function toAreaStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes(DIAG_STATUS.Fail)) {
    return DIAG_STATUS.Fail;
  }

  return statuses.includes(DIAG_STATUS.Ok) ? DIAG_STATUS.Ok : DIAG_STATUS.Skipped;
}

/** A check the panel does not know has no area and stays on the diagnostics screen only. */
export function toDiagAreas(checks: DiagCheck[]): DiagAreaResult[] {
  return AREA_ORDER.flatMap((area) => {
    const own = checks.filter((check) => isCheckName(check.name) && CHECK_AREA[check.name] === area);

    if (own.length === 0) {
      return [];
    }

    const status = toAreaStatus(own.map((check) => check.status));
    const delays = own.flatMap((check) => (check.delayMs === null ? [] : [check.delayMs]));

    return [{ area, status, delayMs: status === DIAG_STATUS.Ok && delays.length > 0 ? Math.max(...delays) : null }];
  });
}
