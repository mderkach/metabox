import type { CheckWire, ReportWire } from '../api/Diag.schema';
import { DIAG_STATUS, isCheckStatus, type DiagCheck } from './Diag.model';

/**
 * Незнакомый статус читается отказом: проверку, исход которой панель не
 * поняла, нельзя показать пройденной.
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

/** Порядок демона сохраняется: он фиксирован — от портов к выходу в интернет. */
export function toDiagChecks(wire: ReportWire): DiagCheck[] {
  return wire.checks.map(toDiagCheck);
}
