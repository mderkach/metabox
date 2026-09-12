import type { RouteChainDto, RouteExplanationDto, RouteMatchDto, RouteRuleDto } from '../api/Route.dto';
import { ROUTE_MATCH, ROUTE_ORIGIN, type RouteExplanation, type RouteMatchKind, type RouteOrigin } from './Route.model';

const ORIGINS = new Set<string>(Object.values(ROUTE_ORIGIN));
const KINDS = new Set<string>(Object.values(ROUTE_MATCH));

function isOrigin(value: string): value is RouteOrigin {
  return ORIGINS.has(value);
}

function isKind(value: string): value is RouteMatchKind {
  return KINDS.has(value);
}

/**
 * Незнакомое происхождение читается как «вычислить нечем».
 *
 * Демон отдаёт ровно три значения, но бинарь и демон обновляются порознь:
 * ослаблять пометку до `observed` на неизвестном значении нельзя — это ровно
 * тот случай, когда прогноз выдают за факт (ADR-0007).
 */
function toOrigin(value: string): RouteOrigin {
  return isOrigin(value) ? value : ROUTE_ORIGIN.Unknown;
}

function toKind(value: string): RouteMatchKind {
  return isKind(value) ? value : ROUTE_MATCH.Unknown;
}

function toMatch(dto: RouteMatchDto) {
  const kind = toKind(dto.kind);

  return {
    origin: toOrigin(dto.origin),
    kind,
    index: kind === ROUTE_MATCH.Rule ? (dto.index ?? null) : null,
    conditions: dto.conditions ?? '',
    action: dto.action ?? '',
    reason: dto.reason ?? '',
  };
}

function toChain(dto: RouteChainDto) {
  return { origin: toOrigin(dto.origin), nodes: dto.nodes ?? [] };
}

function toRule(dto: RouteRuleDto) {
  return {
    origin: toOrigin(dto.origin),
    index: dto.index,
    type: dto.type,
    conditions: dto.conditions,
    action: dto.action,
  };
}

export function toRouteExplanation(dto: RouteExplanationDto): RouteExplanation {
  return {
    connectionId: dto.connection_id,
    match: toMatch(dto.match),
    chain: toChain(dto.chain),
    rules: (dto.rules ?? []).map(toRule),
  };
}
