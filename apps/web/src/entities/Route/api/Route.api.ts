import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import type { RouteExplanationDto } from './Route.dto';
import { ROUTE_ENDPOINT } from './Route.endpoints';

export async function getRouteExplanation(id: string, config?: AxiosRequestConfig): Promise<RouteExplanationDto> {
  return ApiClientInstance.get<RouteExplanationDto>(ROUTE_ENDPOINT.explanation(id), config);
}
