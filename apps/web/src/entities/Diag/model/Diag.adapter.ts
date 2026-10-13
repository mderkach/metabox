import type { CheckWire, ReportWire } from '../api/Diag.schema';
import { DIAG_STATUS, isCheckStatus, type DiagCheck } from './Diag.model';

/**
 * An unfamiliar status is read as a failure: a check whose outcome the panel
 * did not understand cannot be shown as passed.
 */
function toDiagCheck(wire: CheckWire): DiagCheck {
  return {
    name: wire.name,
    status: isCheckStatus(wire.status) ? wire.status : DIAG_STATUS.Fail,
    reason: wire.reason === undefined || wire.reason === '' ? null : wire.reason,
    detail: wire.detail === undefined || wire.detail === '' ? null : wire.detail,
    missing: wire.missing ?? [],
    delayMs: wire.delay_ms ?? null,
  };
}

/** The daemon order is kept: it is fixed, from ports to the internet exit. */
export function toDiagChecks(wire: ReportWire): DiagCheck[] {
  return wire.checks.map(toDiagCheck);
}
