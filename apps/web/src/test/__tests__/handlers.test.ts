import { describe, expect, it } from 'vitest';

import { CONNECTIONS_FIXTURE } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { ConnectionsSnapshotSchema, HistorySchema } from '@shared/api/daemon.generated';

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

    const live = ConnectionsSnapshotSchema.parse(CONNECTIONS_FIXTURE);

    expect(new Set(history.connections)).toEqual(new Set([live.connections.length]));
  });

  it('holds the size of the inflated live snapshot so the chart does not drop when the stream takes over', async () => {
    const history = await readHistory(250);

    expect(new Set(history.connections)).toEqual(new Set([250]));
  });
});
