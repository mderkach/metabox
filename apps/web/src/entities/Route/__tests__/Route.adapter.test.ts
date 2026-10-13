import { describe, expect, it } from 'vitest';

import { RouteExplanationSchema } from '../api/Route.schema';
import { toRouteExplanation } from '../model/Route.adapter';
import { ROUTE_MATCH, ROUTE_ORIGIN } from '../model/Route.model';
import { ROUTE_EXPLANATION_FIXTURE, ROUTE_FINAL_FIXTURE, ROUTE_UNKNOWN_FIXTURE } from './Route.fixture';

describe('toRouteExplanation', () => {
  it('converts the daemon response to the screen model', () => {
    const explanation = toRouteExplanation(ROUTE_EXPLANATION_FIXTURE);

    expect(explanation.connectionId).toBe(ROUTE_EXPLANATION_FIXTURE.connection_id);
    expect(explanation.match.kind).toBe(ROUTE_MATCH.Rule);
    expect(explanation.match.index).toBe(ROUTE_EXPLANATION_FIXTURE.match.index);
    expect(explanation.rules).toHaveLength(ROUTE_EXPLANATION_FIXTURE.rules.length);
  });

  it('leaves the rule node empty when `route.final` fired', () => {
    const explanation = toRouteExplanation(ROUTE_FINAL_FIXTURE);

    expect(explanation.match.kind).toBe(ROUTE_MATCH.Final);
    expect(explanation.match.index).toBeNull();
  });

  it('reads an unknown origin as "nothing to compute with"', () => {
    const explanation = toRouteExplanation({
      ...ROUTE_EXPLANATION_FIXTURE,
      match: { ...ROUTE_EXPLANATION_FIXTURE.match, origin: 'telepathy' },
    });

    expect(explanation.match.origin).toBe(ROUTE_ORIGIN.Unknown);
  });

  it('substitutes empty strings for absent optional fields', () => {
    const explanation = toRouteExplanation(ROUTE_UNKNOWN_FIXTURE);

    expect(explanation.match.conditions).toBe('');
    expect(explanation.match.action).toBe('');
    expect(explanation.match.reason).toBe(ROUTE_UNKNOWN_FIXTURE.match.reason);
    expect(explanation.match.reasonCode).toBe('not_in_process_list');
  });

  it('reads an empty chain as empty', () => {
    const explanation = toRouteExplanation({
      ...ROUTE_UNKNOWN_FIXTURE,
      chain: { origin: ROUTE_ORIGIN.Unknown, nodes: [] },
    });

    expect(explanation.chain.nodes).toEqual([]);
  });
});

describe('RouteExplanationSchema', () => {
  it('does not accept a response without a matched rule', () => {
    expect(RouteExplanationSchema.safeParse({ connection_id: 'c-1' }).success).toBe(false);
  });

  it('does not accept a rule index as a string', () => {
    const broken = { ...ROUTE_EXPLANATION_FIXTURE, match: { ...ROUTE_EXPLANATION_FIXTURE.match, index: '3' } };

    expect(RouteExplanationSchema.safeParse(broken).success).toBe(false);
  });
});
