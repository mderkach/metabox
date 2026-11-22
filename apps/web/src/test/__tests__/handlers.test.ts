import { describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT, readRules } from '@entities/Config';
import { CONNECTIONS_FIXTURE, WALK_CONNECTIONS_FIXTURE } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { ROUTE_ENDPOINT } from '@entities/Route';
import { ExplanationSchema, HistorySchema } from '@shared/api/daemon.generated';

import { createMissingHandlers } from '../handlers';
import { server } from '../server';

async function readHistory(connections?: number) {
  server.use(...createMissingHandlers(connections));

  const response = await fetch(DAEMON_ENDPOINT.history());

  return HistorySchema.parse(await response.json());
}

describe('mock connection history', () => {
  it('holds the fixture snapshot size where the live snapshot has no inflated list', async () => {
    const history = await readHistory();

    expect(new Set(history.connections)).toEqual(
      new Set([CONNECTIONS_FIXTURE.connections.length + WALK_CONNECTIONS_FIXTURE.length])
    );
  });

  it('holds the size of the inflated live snapshot so the chart does not drop when the stream takes over', async () => {
    const history = await readHistory(250);

    expect(new Set(history.connections)).toEqual(new Set([250]));
  });
});

describe('mock walkthrough routes', () => {
  it.each(WALK_CONNECTIONS_FIXTURE)('serves the full applied rule list for $id', async ({ id, host, rule, action }) => {
    server.use(...createMissingHandlers());

    const [configResponse, routeResponse] = await Promise.all([
      fetch(CONFIG_ENDPOINT.config()),
      fetch(ROUTE_ENDPOINT.explanation(id)),
    ]);
    const appliedRules = readRules(await configResponse.text());
    const explanation = ExplanationSchema.parse(await routeResponse.json());
    const { index } = explanation.match;

    expect(explanation.rules).toHaveLength(appliedRules.length);
    expect(explanation.rules.map((entry) => entry.index)).toEqual(appliedRules.map((_, position) => position));
    expect(explanation.match).toMatchObject({ kind: 'rule', conditions: rule, action });
    expect(index).not.toBeNull();
    expect(explanation.rules[index ?? -1]).toMatchObject({ conditions: rule, action });
    expect(appliedRules[index ?? -1]).toMatchObject({ domain: [host.split(':')[0]] });
  });
});
