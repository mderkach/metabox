import { describe, expect, it } from 'vitest';

import { API_FAILURE, ApiError } from '@shared/api';

import { toRouteExplanation } from '../model/Route.adapter';
import { ROUTE_MATCH, ROUTE_ORIGIN } from '../model/Route.model';
import { ROUTE_EXPLANATION_FIXTURE, ROUTE_FINAL_FIXTURE, ROUTE_UNKNOWN_FIXTURE } from './Route.fixture';

/** Отказ возвращается значением: условный `expect` в `catch` линтер не пропускает. */
function catchApiError(run: () => unknown): ApiError | null {
  try {
    run();
  } catch (error) {
    return error instanceof ApiError ? error : null;
  }

  return null;
}

describe('toRouteExplanation', () => {
  it('переводит ответ демона в модель экрана', () => {
    const explanation = toRouteExplanation(ROUTE_EXPLANATION_FIXTURE);

    expect(explanation.connectionId).toBe(ROUTE_EXPLANATION_FIXTURE.connection_id);
    expect(explanation.match.kind).toBe(ROUTE_MATCH.Rule);
    expect(explanation.match.index).toBe(ROUTE_EXPLANATION_FIXTURE.match.index);
    expect(explanation.rules).toHaveLength(ROUTE_EXPLANATION_FIXTURE.rules?.length ?? 0);
  });

  it('оставляет узел правила пустым, когда сработал `route.final`', () => {
    const explanation = toRouteExplanation(ROUTE_FINAL_FIXTURE);

    expect(explanation.match.kind).toBe(ROUTE_MATCH.Final);
    expect(explanation.match.index).toBeNull();
  });

  it('читает незнакомое происхождение как «вычислить нечем»', () => {
    const explanation = toRouteExplanation({
      ...ROUTE_EXPLANATION_FIXTURE,
      match: { ...ROUTE_EXPLANATION_FIXTURE.match, origin: 'telepathy' },
    });

    expect(explanation.match.origin).toBe(ROUTE_ORIGIN.Unknown);
  });

  it('подставляет пустые строки вместо отсутствующих необязательных полей', () => {
    const explanation = toRouteExplanation(ROUTE_UNKNOWN_FIXTURE);

    expect(explanation.match.conditions).toBe('');
    expect(explanation.match.action).toBe('');
    expect(explanation.match.reason).toBe(ROUTE_UNKNOWN_FIXTURE.match.reason);
  });

  it('читает отсутствующую цепочку как пустую', () => {
    const explanation = toRouteExplanation({
      ...ROUTE_UNKNOWN_FIXTURE,
      chain: { origin: ROUTE_ORIGIN.Unknown },
    });

    expect(explanation.chain.nodes).toEqual([]);
  });

  it('отказывает с видом `schema`, когда форма ответа другая', () => {
    const failure = catchApiError(() => toRouteExplanation({ connection_id: 'c-1' }));

    expect(failure?.kind).toBe(API_FAILURE.Schema);
    expect(failure?.details).toContain('match');
  });

  it('отказывает, когда индекс правила пришёл строкой', () => {
    const broken = { ...ROUTE_EXPLANATION_FIXTURE, match: { ...ROUTE_EXPLANATION_FIXTURE.match, index: '3' } };

    expect(() => toRouteExplanation(broken)).toThrowError(ApiError);
  });
});
