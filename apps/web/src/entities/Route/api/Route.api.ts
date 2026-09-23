import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { ROUTE_ENDPOINT } from './Route.endpoints';
import type { RouteExplanationWire, RuleHitsWire } from './Route.schema';

export async function getRouteExplanation(id: string, config?: AxiosRequestConfig): Promise<RouteExplanationWire> {
  return ApiClientInstance.get<RouteExplanationWire>(ROUTE_ENDPOINT.explanation(id), config);
}

export async function getRuleHits(config?: AxiosRequestConfig): Promise<RuleHitsWire> {
  return ApiClientInstance.get<RuleHitsWire>(ROUTE_ENDPOINT.hits(), config);
}
