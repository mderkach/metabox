import { describe, expect, it } from 'vitest';

import { ReportSchema } from '../api/Diag.schema';
import { toDiagChecks } from '../model/Diag.adapter';
import { DIAG_REPORT_FIXTURE } from './Diag.fixture';

describe('toDiagChecks', () => {
  it('сохраняет порядок демона и переносит причину, цепочки и задержку', () => {
    const checks = toDiagChecks(ReportSchema.parse(DIAG_REPORT_FIXTURE));

    expect(checks.map((check) => check.name)).toEqual([
      'redirect_port',
      'tproxy_port',
      'dns_port',
      'dns_probe',
      'nft_chains',
      'proxy',
      'direct',
    ]);
    expect(checks[4]).toMatchObject({
      status: 'fail',
      reason: 'chains_missing',
      missing: ['metabox_prerouting', 'metabox_output'],
    });
    expect(checks[5]).toMatchObject({ status: 'ok', reason: null, delayMs: 182 });
  });

  // Проверку, исход которой панель не поняла, нельзя показать пройденной.
  it('незнакомый статус читает отказом', () => {
    const [check] = toDiagChecks({ checks: [{ name: 'redirect_port', status: 'degraded' }] });

    expect(check.status).toBe('fail');
  });

  it('схема отклоняет отчёт без списка проверок', () => {
    expect(ReportSchema.safeParse({}).success).toBe(false);
  });
});
