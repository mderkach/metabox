import { ROUTE_REASON_CODE } from '../api/Route.schema';

/** Коды причин, по которым правило определить не вышло: набор объявлен демоном. */
export type RouteReasonCode = (typeof ROUTE_REASON_CODE)[number];

/**
 * Происхождение утверждения. Значений ровно три, и утверждение без
 * происхождения на экран не попадает (ADR-0007).
 */
export const ROUTE_ORIGIN = {
  /** Пришло от core: список правил, сработавшее правило, цепочка. */
  Observed: 'observed',
  /** Вычислено metabox или получено вопросом к бинарю. */
  Computed: 'computed',
  /** Вычислить нечем. */
  Unknown: 'unknown',
} as const;

export type RouteOrigin = (typeof ROUTE_ORIGIN)[keyof typeof ROUTE_ORIGIN];

export const ROUTE_MATCH = {
  Rule: 'rule',
  /** Ни одно правило не совпало — использован `route.final`. */
  Final: 'final',
  Unknown: 'unknown',
} as const;

export type RouteMatchKind = (typeof ROUTE_MATCH)[keyof typeof ROUTE_MATCH];

export interface RouteRule {
  origin: RouteOrigin;
  /** Индекс узла `route.rules`, считая с нуля. */
  index: number;
  type: string;
  conditions: string;
  action: string;
}

export interface RouteMatch {
  origin: RouteOrigin;
  kind: RouteMatchKind;
  /** `null` — узла в `route.rules` нет: `final` или неизвестность. */
  index: number | null;
  conditions: string;
  action: string;
  /** Почему вычислить не удалось; пусто у найденного правила. */
  reasonCode: RouteReasonCode | null;
  /** Та же причина словами демона: запасной текст для незнакомого кода. */
  reason: string;
}

export interface RouteExplanation {
  connectionId: string;
  match: RouteMatch;
  chain: {
    origin: RouteOrigin;
    /** Порядок core: от конечного узла к группе. */
    nodes: string[];
  };
  rules: RouteRule[];
}
