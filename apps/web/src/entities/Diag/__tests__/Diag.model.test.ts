import { describe, expect, it } from 'vitest';

import { DIAG_AREA, toDiagAreas, type DiagCheck } from '../model/Diag.model';

function check(name: string, status: DiagCheck['status'], delayMs: number | null = null): DiagCheck {
  return { name, status, reason: null, detail: null, missing: [], delayMs };
}

describe('toDiagAreas', () => {
  it('fails an area when one of its checks failed', () => {
    const areas = toDiagAreas([check('redirect_port', 'fail'), check('tproxy_port', 'ok'), check('nft_chains', 'ok')]);

    expect(areas).toEqual([{ area: DIAG_AREA.Interception, status: 'fail', delayMs: null }]);
  });

  it('does not pass an area whose checks were all skipped', () => {
    expect(toDiagAreas([check('direct', 'skipped')])).toEqual([
      { area: DIAG_AREA.Direct, status: 'skipped', delayMs: null },
    ]);
  });

  it('keeps the area order and the exit latency, and leaves unknown checks out', () => {
    const areas = toDiagAreas([check('proxy', 'ok', 182), check('dns_probe', 'ok'), check('ipv6_route', 'fail')]);

    expect(areas).toEqual([
      { area: DIAG_AREA.Dns, status: 'ok', delayMs: null },
      { area: DIAG_AREA.Proxy, status: 'ok', delayMs: 182 },
    ]);
  });
});
