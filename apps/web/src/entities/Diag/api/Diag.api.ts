import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { DIAG_ENDPOINT } from './Diag.endpoints';
import type { ReportWire } from './Diag.schema';

/**
 * Прогон шлёт пакеты с роутера и оставляет строки в логе sing-box: подключение
 * к порту redirect и замер узла. Поэтому он только по действию пользователя.
 */
export async function getDiagReport(proxy: string, config?: AxiosRequestConfig): Promise<ReportWire> {
  return ApiClientInstance.get<ReportWire>(DIAG_ENDPOINT.report(), {
    ...config,
    params: proxy === '' ? undefined : { proxy },
  });
}
