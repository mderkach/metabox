import type { ReportWire } from '../api/Diag.schema';

/** Interception taken: no chains, the redirect port is closed, DNS and outbounds are fine. */
export const DIAG_REPORT_FIXTURE: ReportWire = {
  checks: [
    {
      name: 'redirect_port',
      status: 'fail',
      reason: 'not_listening',
      detail: 'dial tcp 127.0.0.1:5331: connection refused',
    },
    { name: 'tproxy_port', status: 'ok' },
    { name: 'dns_port', status: 'ok' },
    { name: 'dns_probe', status: 'ok' },
    {
      name: 'nft_chains',
      status: 'fail',
      reason: 'chains_missing',
      missing: ['metabox_prerouting', 'metabox_output'],
    },
    { name: 'proxy', status: 'ok', delay_ms: 182 },
    { name: 'direct', status: 'skipped', reason: 'unsupported' },
  ],
};
