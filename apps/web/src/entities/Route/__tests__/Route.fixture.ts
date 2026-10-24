import type { RouteExplanationWire } from '../api/Route.schema';

/**
 * Daemon response for a connection that went to `alt-fallback` by rule set.
 * Rule indexes count from zero: these are indexes of `route.rules` nodes.
 *
 * There are seven rules here, and 32 in the fixture config, so next to it the panel
 * shows a list mismatch and disables the jump to the node. This is not a breakage:
 * this is how the "process runs a different config" case looks.
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

/** No rule matched: `route.final` fired, and this is an observation. */
export const ROUTE_FINAL_FIXTURE: RouteExplanationWire = {
  connection_id: 'c-2',
  match: { origin: 'observed', kind: 'final' },
  chain: { origin: 'observed', nodes: ['direct'] },
  rules: ROUTE_EXPLANATION_FIXTURE.rules,
};

/**
 * The connection has conditions, but they were not found in the process list: the explanation
 * is marked unknown with a reason, not a guess.
 */
export const ROUTE_UNKNOWN_FIXTURE: RouteExplanationWire = {
  connection_id: 'c-3',
  match: {
    origin: 'unknown',
    kind: 'unknown',
    reason_code: 'not_in_process_list',
    reason: 'the connection rule is not in the rule list of the running process',
  },
  chain: { origin: 'observed', nodes: ['direct'] },
  rules: [],
};

/**
 * The process rule list for explanations by connection snapshot: conditions and
 * actions are exactly those the snapshot rows carry, so each connection
 * finds its rule in it. The list does not match the fixture config, and the
 * panel still shows the list mismatch.
 */
export const ROUTE_PROCESS_RULES_FIXTURE: RouteExplanationWire['rules'] = [
  { origin: 'observed', index: 0, type: 'default', conditions: '', action: 'sniff' },
  { origin: 'observed', index: 1, type: 'default', conditions: 'inbound=dns-in', action: 'hijack-dns' },
  { origin: 'observed', index: 2, type: 'default', conditions: 'port=53', action: 'hijack-dns' },
  { origin: 'observed', index: 3, type: 'default', conditions: 'rule_set=google-ip', action: 'route(us-fallback)' },
  { origin: 'observed', index: 4, type: 'default', conditions: 'rule_set=github', action: 'route(proxy)' },
  { origin: 'observed', index: 5, type: 'default', conditions: 'rule_set=openai', action: 'route(proxy)' },
  { origin: 'observed', index: 6, type: 'default', conditions: '', action: 'route(direct)' },
];

/**
 * The explanation chain diverged from the row chain. A regular case
 * (ADR-0007): the row arrived with a stream snapshot, the explanation by a separate handler
 * later, and `urltest` moved traffic to another node in the meantime.
 *
 * The identifier is the `clients.google.example` connection from the connections snapshot:
 * its row has `sub-us/us-reality`, the explanation has `sub-us/us-hysteria`.
 */
export const ROUTE_DRIFTED_CHAIN_FIXTURE: RouteExplanationWire = {
  connection_id: '3c9f0b71-5d43-4a1f-8c6e-9a1b2c3d4e5f',
  match: {
    origin: 'observed',
    kind: 'rule',
    index: 3,
    conditions: 'rule_set=google-ip',
    action: 'route(us-fallback)',
  },
  chain: { origin: 'observed', nodes: ['sub-us/us-hysteria', 'us', 'us-fallback'] },
  rules: ROUTE_PROCESS_RULES_FIXTURE,
};
