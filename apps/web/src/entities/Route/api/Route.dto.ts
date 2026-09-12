/** Ответ `GET /api/connections/{id}/route` — `route.Explanation` демона. */
export interface RouteExplanationDto {
  connection_id: string;
  match: RouteMatchDto;
  chain: RouteChainDto;
  rules?: RouteRuleDto[];
}

export interface RouteMatchDto {
  origin: string;
  kind: string;
  /** Индекс узла `route.rules`, считая с нуля. Отсутствует у `final` и `unknown`. */
  index?: number;
  conditions?: string;
  action?: string;
  reason?: string;
}

export interface RouteChainDto {
  origin: string;
  nodes?: string[];
}

export interface RouteRuleDto {
  origin: string;
  index: number;
  type: string;
  conditions: string;
  action: string;
}
