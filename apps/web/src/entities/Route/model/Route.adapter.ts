import { ROUTE_REASON_CODE, type RouteExplanationWire, type RuleHitsWire } from '../api/Route.schema';
import {
  ROUTE_MATCH,
  ROUTE_ORIGIN,
  type RouteExplanation,
  type RouteMatchKind,
  type RouteOrigin,
  type RouteReasonCode,
  type RuleHits,
} from './Route.model';

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

/** Незнакомый код читается как «причина не названа»: текст берётся из `reason`. */
function toReasonCode(value: string | undefined): RouteReasonCode | null {
  return ROUTE_REASON_CODE.find((code) => code === value) ?? null;
}

function toMatch(dto: RouteExplanationWire['match']) {
  const kind = toKind(dto.kind);

  return {
    origin: toOrigin(dto.origin),
    kind,
    index: kind === ROUTE_MATCH.Rule ? (dto.index ?? null) : null,
    conditions: dto.conditions ?? '',
    action: dto.action ?? '',
    reasonCode: toReasonCode(dto.reason_code),
    reason: dto.reason ?? '',
  };
}

function toChain(dto: RouteExplanationWire['chain']) {
  return { origin: toOrigin(dto.origin), nodes: dto.nodes };
}

function toRule(dto: RouteExplanationWire['rules'][number]) {
  return {
    origin: toOrigin(dto.origin),
    index: dto.index,
    type: dto.type,
    conditions: dto.conditions,
    action: dto.action,
  };
}

/**
 * Объяснение маршрута из ответа демона. Форма проверяется схемой, и непонятый
 * ответ становится отказом, а не пустым экраном: «правило не найдено» и «ответ
 * не разобран» — разные вещи, и вторую пользователь обязан видеть (ADR-0007).
 */
export function toRouteExplanation(dto: RouteExplanationWire): RouteExplanation {
  return {
    connectionId: dto.connection_id,
    match: toMatch(dto.match),
    chain: toChain(dto.chain),
    rules: dto.rules.map(toRule),
  };
}

export function toRuleHits(dto: RuleHitsWire): RuleHits {
  const byIndex = Array.from({ length: dto.rules.length }, (): number | null => null);

  for (const rule of dto.rules) {
    byIndex[rule.index] = rule.counted ? rule.hits : null;
  }

  return { seconds: dto.seconds, byIndex, final: dto.final };
}
