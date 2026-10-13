import { http, HttpResponse } from 'msw';

import { ROUTE_ENDPOINT } from '../api/Route.endpoints';
import type { RouteExplanationWire, RuleHitsWire } from '../api/Route.schema';
import { ROUTE_DRIFTED_CHAIN_FIXTURE, ROUTE_PROCESS_RULES_FIXTURE, ROUTE_UNKNOWN_FIXTURE } from './Route.fixture';

/**
 * The address is decoded back: the connection identifier in the daemon constant
 * passes through `encodeURIComponent`, and the msw template colon would become
 * `%3A`, which no request would match.
 */
const ROUTE_PATTERN = decodeURIComponent(ROUTE_ENDPOINT.explanation(':id'));

/** Three hours of daemon uptime: the count window in the rule list footer. */
const HITS_SECONDS = 10_800;

/** Every rule with this ordinal did not fire: the test bench shows a zero too. */
const SILENT_EVERY = 5;
const HITS_STEP = 37;
const FINAL_HITS = 12;

/** As in the daemon: the core connection list shows only routes to an outbound. */
function isCounted(rule: unknown): boolean {
  const action: unknown = typeof rule === 'object' && rule !== null ? Reflect.get(rule, 'action') : undefined;

  return action === undefined || action === 'route' || action === 'bypass';
}

/**
 * Per-rule count for every `route.rules` node: the number of process rules
 * matches the file, as on the device after apply. Rules come
 * from outside: the test bench config lives in a neighboring slice.
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

/** Connection row fields from which the daemon builds the explanation. */
interface ExplainedConnection {
  id: string;
  rule: string;
  action: string;
  final: boolean;
  chain: readonly string[];
}

/**
 * An explanation consistent with the row, as the daemon builds it: the rule
 * is looked up in the process list by conditions and action, the chain is the same as in
 * the row.
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
 * Explanation by `connection_id` from a map built from the connections snapshot:
 * the panel has its own per row, and the chain matches the row chain. One
 * connection gets a diverged chain: the regular case of ADR-0007.
 *
 * Connections come from outside: the snapshot lives in a neighboring slice. Multiplied
 * snapshots of the dev bench and tests append a suffix to the sample identifier,
 * so a sample is looked up by prefix too. An unknown identifier is 404, as in the
 * daemon when the connection is already closed.
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
