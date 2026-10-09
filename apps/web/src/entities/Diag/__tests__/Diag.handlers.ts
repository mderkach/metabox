import { http, HttpResponse } from 'msw';

import { DIAG_ENDPOINT } from '../api/Diag.endpoints';
import type { ReportWire } from '../api/Diag.schema';
import { DIAG_REPORT_FIXTURE } from './Diag.fixture';

/** Без узла строка выхода через узел — пропуск, как у демона. */
function withoutProxy(report: ReportWire): ReportWire {
  return {
    checks: report.checks.map((check) =>
      check.name === 'proxy' ? { name: 'proxy', status: 'skipped', reason: 'proxy_unset' } : check
    ),
  };
}

export function createDiagHandlers(report: ReportWire = DIAG_REPORT_FIXTURE) {
  return [
    http.get(DIAG_ENDPOINT.report(), ({ request }) => {
      const proxy = new URL(request.url).searchParams.get('proxy');

      return HttpResponse.json(proxy === null || proxy === '' ? withoutProxy(report) : report);
    }),
  ];
}
