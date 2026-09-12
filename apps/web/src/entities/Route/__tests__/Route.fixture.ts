import type { RouteExplanationWire } from '../api/Route.schema';

/**
 * Ответ демона на соединение, ушедшее в `alt-fallback` по rule-set.
 * Индексы правил считаются с нуля — это индексы узлов `route.rules`.
 *
 * Правил здесь семь, а в конфиге фикстуры их 32, поэтому в дев-режиме панель
 * показывает расхождение списков и отключает переход к узлу. Это не поломка:
 * так выглядит случай «процесс исполняет другой конфиг» из ADR-0007.
 */
export const ROUTE_EXPLANATION_FIXTURE: RouteExplanationWire = {
  connection_id: 'c-1',
  match: {
    origin: 'observed',
    kind: 'rule',
    index: 6,
    conditions: 'rule_set=google-ip',
    action: 'route(alt-fallback)',
  },
  chain: { origin: 'observed', nodes: ['hk-01', 'alt-fallback'] },
  rules: [
    { origin: 'observed', index: 0, type: 'default', conditions: '', action: 'sniff' },
    { origin: 'observed', index: 1, type: 'default', conditions: 'inbound=dns-in', action: 'hijack-dns' },
    { origin: 'observed', index: 2, type: 'default', conditions: 'port=53', action: 'hijack-dns' },
    {
      origin: 'observed',
      index: 3,
      type: 'default',
      conditions: 'source_ip_cidr=192.168.1.100/32 source_port=25565',
      action: 'route(direct)',
    },
    { origin: 'observed', index: 4, type: 'default', conditions: 'clash_mode=Direct', action: 'route(direct)' },
    { origin: 'observed', index: 5, type: 'default', conditions: 'clash_mode=Global', action: 'route(proxy)' },
    { origin: 'observed', index: 6, type: 'default', conditions: 'rule_set=google-ip', action: 'route(alt-fallback)' },
  ],
};

/** Ни одно правило не совпало: сработал `route.final`, и это наблюдение. */
export const ROUTE_FINAL_FIXTURE: RouteExplanationWire = {
  connection_id: 'c-2',
  match: { origin: 'observed', kind: 'final' },
  chain: { origin: 'observed', nodes: ['direct'] },
  rules: ROUTE_EXPLANATION_FIXTURE.rules,
};

/**
 * Условия у соединения есть, а в списке процесса не нашлись: объяснение
 * помечается неизвестностью с причиной, а не догадкой (ADR-0007).
 */
export const ROUTE_UNKNOWN_FIXTURE: RouteExplanationWire = {
  connection_id: 'c-3',
  match: { origin: 'unknown', kind: 'unknown', reason: 'правила соединения нет в списке работающего процесса' },
  chain: { origin: 'observed', nodes: ['direct'] },
  rules: [],
};
