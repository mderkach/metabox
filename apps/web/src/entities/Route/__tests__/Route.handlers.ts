import { http, HttpResponse } from 'msw';

import { ROUTE_ENDPOINT } from '../api/Route.endpoints';
import type { RuleHitsWire } from '../api/Route.schema';
import { ROUTE_EXPLANATION_FIXTURE } from './Route.fixture';

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

export const routeHandlers = [
  http.get(ROUTE_PATTERN, ({ params }) =>
    HttpResponse.json({ ...ROUTE_EXPLANATION_FIXTURE, connection_id: String(params.id) })
  ),
];
