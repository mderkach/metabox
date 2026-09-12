import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { ROUTE_ENDPOINT } from './Route.endpoints';

/**
 * Ответ отдаётся как есть: разбирает его схема в фабрике опций, и в кэш Query
 * ложится уже модель. Преобразований здесь нет (Query.md).
 */
export async function getRouteExplanation(id: string, config?: AxiosRequestConfig): Promise<unknown> {
  return ApiClientInstance.get<unknown>(ROUTE_ENDPOINT.explanation(id), config);
}
