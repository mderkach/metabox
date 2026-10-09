import { CONFIG_FIXTURE } from '@entities/Config/__tests__/Config.fixture';
import { configHandlers } from '@entities/Config/__tests__/Config.handlers';
import {
  advanceConnectionsSnapshot,
  CONNECTIONS_FIXTURE,
  makeConnectionsSnapshot,
} from '@entities/Connection/__tests__/Connection.fixture';
import { connectionHandlers } from '@entities/Connection/__tests__/Connection.handlers';
import {
  MEMORY_SAMPLES,
  SERVICE_RUNNING_FIXTURE,
  SYSTEM_FIXTURE,
  TRAFFIC_SAMPLE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { createStatefulDaemonHandlers } from '@entities/Daemon/__tests__/Daemon.handlers';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { createDiagHandlers } from '@entities/Diag/__tests__/Diag.handlers';
import { createLogHandlers } from '@entities/Log/__tests__/Log.handlers';
import { createStatefulProxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { createRouteHandlers, createRuleHitsHandler } from '@entities/Route/__tests__/Route.handlers';
import { ruleSetHandlers } from '@entities/RuleSet/__tests__/RuleSet.handlers';
import { RUNTIME_TOPIC } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

import { runtimeStreamHandler } from './runtimeStream';

/** Шаг потока на устройстве — замер 2026-09-10: сэмпл раз в секунду. */
const STREAM_INTERVAL = MS_IN_SECOND;

let memorySample = 0;
let connectionsFrame = 0;

/**
 * Сборка моков для дев-режима. Сами хендлеры и фикстуры лежат в `__tests__`
 * своих слайсов, рядом с кодом, который они подменяют. Берутся они прямым
 * путём, а не через Public API слайса: в барреле они тянули бы msw в прод.
 *
 * Единый поток рантайма собирается тут же: он один на все топики, и данные в
 * него складывают фикстуры разных слайсов. Демон и прокси подключаются
 * вариантами с состоянием — выбор узла и окно подтверждения должны держаться
 * до перезагрузки страницы, иначе ручная проверка выглядит поломкой.
 */
export function createMissingHandlers(connections = 0) {
  // Снапшот собирается один раз и дальше меняется на месте: раздувать пять
  // тысяч строк на каждый тик означало бы мерить генератор, а не панель. Копия
  // обязательна: сам `CONNECTIONS_FIXTURE` делит массив соединений с образцами,
  // из которых собираются кадры, и правка на месте испортила бы эталон.
  const snapshot =
    connections > 0
      ? makeConnectionsSnapshot(connections, { vary: true })
      : {
          ...CONNECTIONS_FIXTURE,
          connections: CONNECTIONS_FIXTURE.connections.map((row) => ({ ...row, chain: [...row.chain] })),
        };

  return [
    ...configHandlers,
    ...createStatefulDaemonHandlers(),
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
