import { describe, expect, it } from 'vitest';

import { ReportSchema } from '../api/Diag.schema';
import { toDiagChecks } from '../model/Diag.adapter';
import { DIAG_REPORT_FIXTURE } from './Diag.fixture';

describe('toDiagChecks', () => {
  it('keeps the daemon order and carries the reason, chains and latency', () => {
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

  // A check whose outcome the panel did not understand cannot be shown as passed.
  it('reads an unknown status as a failure', () => {
    const [check] = toDiagChecks({ checks: [{ name: 'redirect_port', status: 'degraded' }] });

    expect(check.status).toBe('fail');
  });

  it('the schema rejects a report without a check list', () => {
    expect(ReportSchema.safeParse({}).success).toBe(false);
  });
});
