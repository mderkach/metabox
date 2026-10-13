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
