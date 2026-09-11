import { configHandlers } from '@entities/Config';
import { connectionHandlers } from '@entities/Connection';
import { daemonHandlers } from '@entities/Daemon';
import { createStatefulProxyHandlers } from '@entities/Proxy';

/**
 * Сборка моков для дев-режима. Сами хендлеры и фикстуры лежат в `__tests__`
 * своих слайсов, рядом с кодом, который они подменяют, и берутся отсюда через
 * их Public API — обход барреля здесь не нужен и не делается.
 *
 * Прокси подключаются вариантом с состоянием: выбор узла в группе должен
 * держаться до перезагрузки страницы, иначе ручная проверка выглядит поломкой.
 */
export const missingHandlers = [
  ...configHandlers,
  ...daemonHandlers,
  ...createStatefulProxyHandlers(),
  ...connectionHandlers,
];
