import { configHandlers } from '@entities/Config';
import { connectionHandlers, CONNECTIONS_FIXTURE } from '@entities/Connection';
import {
  createStatefulDaemonHandlers,
  MEMORY_SAMPLES,
  SERVICE_RUNNING_FIXTURE,
  TRAFFIC_SAMPLE,
} from '@entities/Daemon';
import { createStatefulProxyHandlers } from '@entities/Proxy';
import { routeHandlers } from '@entities/Route';
import { RUNTIME_TOPIC } from '@shared/api';

import { runtimeStreamHandler } from './runtimeStream';

/** Шаг потока на устройстве — замер 2026-09-10: сэмпл раз в секунду. */
const STREAM_INTERVAL = 1000;

let memorySample = 0;

/**
 * Сборка моков для дев-режима. Сами хендлеры и фикстуры лежат в `__tests__`
 * своих слайсов, рядом с кодом, который они подменяют, и берутся отсюда через
 * их Public API — обход барреля здесь не нужен и не делается.
 *
 * Единый поток рантайма собирается тут же: он один на все топики, и данные в
 * него складывают фикстуры разных слайсов. Демон и прокси подключаются
 * вариантами с состоянием — выбор узла и окно подтверждения должны держаться
 * до перезагрузки страницы, иначе ручная проверка выглядит поломкой.
 */
export const missingHandlers = [
  ...configHandlers,
  ...createStatefulDaemonHandlers(),
  ...createStatefulProxyHandlers(),
  ...connectionHandlers,
  ...routeHandlers,
  runtimeStreamHandler(
    [
      { topic: RUNTIME_TOPIC.Service, data: () => SERVICE_RUNNING_FIXTURE },
      { topic: RUNTIME_TOPIC.Connections, data: () => CONNECTIONS_FIXTURE },
      { topic: RUNTIME_TOPIC.Traffic, data: () => TRAFFIC_SAMPLE },
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
