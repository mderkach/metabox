import type { AxiosRequestConfig } from 'axios';

import { API_ENDPOINT, ApiClientInstance } from '@shared/api';

/** Axios разобрал бы тело в объект, а нам нужны исходные байты файла. */
const KEEP_RAW = [(data: string) => data];

/**
 * Конфиг забирается текстом: правки применяются к исходным байтам, иначе
 * порядок ключей пользователя переписывается целиком (ADR-0004, AC-2).
 */
export async function getConfig(config?: AxiosRequestConfig): Promise<string> {
  return ApiClientInstance.get<string>(API_ENDPOINT.config(), {
    responseType: 'text',
    transformResponse: KEEP_RAW,
    ...config,
  });
}
