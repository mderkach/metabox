import { http, HttpResponse } from 'msw';

import { createAuthHandlers } from '@entities/Auth/__tests__/Auth.handlers';
import { CONFIG_FIXTURE } from '@entities/Config/__tests__/Config.fixture';
import { configHandlers } from '@entities/Config/__tests__/Config.handlers';
import {
  advanceConnectionsSnapshot,
  CONNECTIONS_FIXTURE,
  makeConnectionsSnapshot,
} from '@entities/Connection/__tests__/Connection.fixture';
import { connectionHandlers } from '@entities/Connection/__tests__/Connection.handlers';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  MEMORY_SAMPLES,
  SERVICE_RUNNING_FIXTURE,
  SYSTEM_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
  TRAFFIC_SAMPLE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { createStatefulDaemonHandlers } from '@entities/Daemon/__tests__/Daemon.handlers';
import { createDataplaneMock } from '@entities/Dataplane/__tests__/Dataplane.handlers';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { createDiagHandlers } from '@entities/Diag/__tests__/Diag.handlers';
import { createLogHandlers } from '@entities/Log/__tests__/Log.handlers';
import { createMcpHandlers } from '@entities/Mcp/__tests__/Mcp.handlers';
import { createStatefulProxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { createRouteHandlers, createRuleHitsHandler } from '@entities/Route/__tests__/Route.handlers';
import { ruleSetHandlers } from '@entities/RuleSet/__tests__/RuleSet.handlers';
import { RUNTIME_TOPIC } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

import { runtimeStreamHandler } from './runtimeStream';

/** Stream step on the device — measured 2026-09-10: one sample per second. */
const STREAM_INTERVAL = MS_IN_SECOND;

let memorySample = 0;
let connectionsFrame = 0;

/**
 * Mock assembly for dev mode. The handlers and fixtures themselves live in the `__tests__`
 * of their slices, next to the code they replace. They are taken by a direct
 * path, not through the slice Public API: in a barrel they would pull msw into prod.
 *
 * The single runtime stream is assembled right here: it is one for all topics, and fixtures of different
 * slices put data into it. The daemon and proxy are connected
 * as stateful variants — node selection and the confirmation window must persist
 * until the page reloads, otherwise manual checking looks like breakage.
 */
export function createMissingHandlers(connections = 0) {
  // The snapshot is assembled once and then changes in place: inflating five
  // thousand rows on every tick would measure the generator, not the panel. A copy
  // is mandatory: `CONNECTIONS_FIXTURE` itself shares the connection array with the samples
  // the frames are built from, and an in-place edit would spoil the reference.
  const snapshot =
    connections > 0
      ? makeConnectionsSnapshot(connections, { vary: true })
      : {
          ...CONNECTIONS_FIXTURE,
          connections: CONNECTIONS_FIXTURE.connections.map((row) => ({ ...row, chain: [...row.chain] })),
        };

  const dataplane = createDataplaneMock();

  return [
    ...createAuthHandlers(),
    ...createMcpHandlers(),
    ...configHandlers,
    // The daemon minute of open connections matches the live snapshot: with the
    // test fixture's 150 the chart would drop where the stream takes over.
    http.get(DAEMON_ENDPOINT.history(), () =>
      HttpResponse.json({
        ...TRAFFIC_HISTORY_FIXTURE,
        connections: TRAFFIC_HISTORY_FIXTURE.connections.map(() => snapshot.connections.length),
      })
    ),
    ...createStatefulDaemonHandlers(dataplane.status),
    ...dataplane.handlers,
    ...createStatefulProxyHandlers(),
    ...createDeviceHandlers(),
    ...createLogHandlers(),
    ...createDiagHandlers(),
    ...connectionHandlers,
    ...createRouteHandlers(CONNECTIONS_FIXTURE.connections),
    ...ruleSetHandlers,
    createRuleHitsHandler(CONFIG_FIXTURE.route?.rules ?? []),
    runtimeStreamHandler(
      [
        { topic: RUNTIME_TOPIC.Service, data: () => SERVICE_RUNNING_FIXTURE },
        {
          topic: RUNTIME_TOPIC.Connections,
          data: () => {
            connectionsFrame += 1;

            return advanceConnectionsSnapshot(snapshot, connectionsFrame);
          },
        },
        { topic: RUNTIME_TOPIC.Traffic, data: () => TRAFFIC_SAMPLE },
        { topic: RUNTIME_TOPIC.System, data: () => SYSTEM_FIXTURE },
        {
          topic: RUNTIME_TOPIC.Memory,
          data: () => {
            memorySample += 1;

            return { inuse: MEMORY_SAMPLES[memorySample % MEMORY_SAMPLES.length], oslimit: 0 };
          },
        },
      ],
      STREAM_INTERVAL
    ),
  ];
}
