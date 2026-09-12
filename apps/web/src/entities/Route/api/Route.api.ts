import type { AxiosRequestConfig } from 'axios';

import { API_ENDPOINT, ApiClientInstance } from '@shared/api';

import type { RouteExplanationDto } from './Route.dto';

export async function getRouteExplanation(id: string, config?: AxiosRequestConfig): Promise<RouteExplanationDto> {
  return ApiClientInstance.get<RouteExplanationDto>(API_ENDPOINT.connectionRoute(id), config);
}
