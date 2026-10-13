import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { DIAG_ENDPOINT } from './Diag.endpoints';
import type { ReportWire } from './Diag.schema';

/**
 * A run sends packets from the router and leaves lines in the sing-box log: a
 * connection to the redirect port and a node probe. So it runs only on a user
 * action.
 */
export async function getDiagReport(proxy: string, config?: AxiosRequestConfig): Promise<ReportWire> {
  return ApiClientInstance.get<ReportWire>(DIAG_ENDPOINT.report(), {
    ...config,
    params: proxy === '' ? undefined : { proxy },
  });
}
