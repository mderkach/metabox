import { http, HttpResponse } from 'msw';

import { ROUTE_ENDPOINT } from '../api/Route.endpoints';
import type { RouteExplanationWire, RuleHitsWire } from '../api/Route.schema';
import { ROUTE_DRIFTED_CHAIN_FIXTURE, ROUTE_PROCESS_RULES_FIXTURE, ROUTE_UNKNOWN_FIXTURE } from './Route.fixture';

/**
 * Адрес расшифровывается обратно: идентификатор соединения в константе демона
 * проходит через `encodeURIComponent`, и двоеточие шаблона msw превратилось бы
 * в `%3A`, мимо которого не совпал бы ни один запрос.
 */
const ROUTE_PATTERN = decodeURIComponent(ROUTE_ENDPOINT.explanation(':id'));

/** Три часа работы демона: окно счёта в подвале списка правил. */
const HITS_SECONDS = 10_800;

/** Каждое такое по счёту правило не срабатывало: на стенде виден и ноль. */
const SILENT_EVERY = 5;
const HITS_STEP = 37;
const FINAL_HITS = 12;

/** Как у демона: в списке соединений core видны только маршруты в outbound. */
function isCounted(rule: unknown): boolean {
  const action: unknown = typeof rule === 'object' && rule !== null ? Reflect.get(rule, 'action') : undefined;

  return action === undefined || action === 'route' || action === 'bypass';
}

/**
 * Счёт по правилу на каждый узел `route.rules`: число правил процесса
 * совпадает с файлом, как на устройстве после применения. Правила приходят
 * снаружи — конфиг стенда лежит в соседнем слайсе.
 */
function toRuleHitsFixture(rules: readonly unknown[]): RuleHitsWire {
  return {
    seconds: HITS_SECONDS,
    rules: rules.map((rule, index) => ({
      index,
      hits: (index + 1) % SILENT_EVERY === 0 ? 0 : (index + 1) * HITS_STEP,
      counted: isCounted(rule),
    })),
    final: FINAL_HITS,
  };
}

export function createRuleHitsHandler(rules: readonly unknown[]) {
  return http.get(ROUTE_ENDPOINT.hits(), () => HttpResponse.json(toRuleHitsFixture(rules)));
}

/** Поля строки соединения, из которых демон собирает объяснение. */
interface ExplainedConnection {
  id: string;
  rule: string;
  action: string;
  final: boolean;
  chain: readonly string[];
}

/**
 * Объяснение, согласованное со строкой, как его собирает демон: правило
 * ищется в списке процесса по условиям и действию, цепочка — та же, что у
 * строки.
 */
function toRouteExplanationFixture(connection: ExplainedConnection): RouteExplanationWire {
  const chain = { origin: 'observed', nodes: [...connection.chain] };
  const rules = ROUTE_PROCESS_RULES_FIXTURE;

  if (connection.final) {
    return { connection_id: connection.id, match: { origin: 'observed', kind: 'final' }, chain, rules };
  }

  const rule = rules.find(
    (candidate) => candidate.conditions === connection.rule && candidate.action === connection.action
  );

  if (rule === undefined) {
    return { ...ROUTE_UNKNOWN_FIXTURE, connection_id: connection.id, chain, rules };
  }

  const { index, conditions, action } = rule;

  return {
    connection_id: connection.id,
    match: { origin: 'observed', kind: 'rule', index, conditions, action },
    chain,
    rules,
  };
}

/**
 * Объяснение по `connection_id` из карты, собранной по снимку соединений:
 * панель у каждой строки своя, а цепочка совпадает с цепочкой строки. Одно
 * соединение получает разошедшуюся цепочку — штатный случай ADR-0007.
 *
 * Соединения приходят снаружи — снимок лежит в соседнем слайсе. Размноженные
 * снимки дев-стенда и тестов дописывают к идентификатору образца суффикс,
 * поэтому образец ищется и по префиксу. Незнакомый идентификатор — 404, как у
 * демона, когда соединение уже закрылось.
 */
export function createRouteHandlers(connections: readonly ExplainedConnection[]) {
  const explanations = new Map(connections.map((connection) => [connection.id, toRouteExplanationFixture(connection)]));

  explanations.set(ROUTE_DRIFTED_CHAIN_FIXTURE.connection_id, ROUTE_DRIFTED_CHAIN_FIXTURE);

  function findExplanation(id: string): RouteExplanationWire | undefined {
    return explanations.get(id) ?? [...explanations].find(([sample]) => id.startsWith(`${sample}-`))?.[1];
  }

  return [
    http.get(ROUTE_PATTERN, ({ params }) => {
      const id = String(params.id);
      const explanation = findExplanation(id);

      return explanation === undefined
        ? HttpResponse.json(
            { code: 'connection_missing', message: 'соединения с таким идентификатором нет' },
            { status: 404 }
          )
        : HttpResponse.json({ ...explanation, connection_id: id });
    }),
  ];
}
