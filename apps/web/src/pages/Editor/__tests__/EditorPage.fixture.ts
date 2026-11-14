import { http, HttpResponse } from 'msw';

import { ConfigDocumentState, CONFIG_ENDPOINT, findValue } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { ROUTE_ENDPOINT } from '@entities/Route';

export const CONFIG = JSON.stringify(
  {
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
    ],
    route: {
      rules: [
        { rule_set: ['github'], outbound: 'proxy' },
        { port: 53, action: 'hijack-dns' },
        // The rule schema is a `looseObject`, it accepts extra keys.
        // A node becomes unrecognized by a value that is in no branch of the
        // union: that comes from a binary newer than the panel schema.
        { action: 'quantum-teleport' },
      ],
    },
  },
  null,
  2
);

/** The same, but the schema accepts all nodes: then the rule has an outbound list. */
export const RECOGNIZED_CONFIG = JSON.stringify(
  {
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
    ],
    route: { rules: [{ rule_set: ['github'], outbound: 'proxy' }] },
  },
  null,
  2
);

/** Rules for list editing: the schema accepts all nodes, the default route is set. */
export const EDIT_RULES = [
  { rule_set: ['github'], outbound: 'proxy' },
  { port: 53, action: 'hijack-dns' },
  { domain_suffix: ['example.org'], outbound: 'direct' },
];

export function editConfig(rules: unknown[]): string {
  return JSON.stringify(
    {
      outbounds: [
        { type: 'direct', tag: 'direct' },
        { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
      ],
      route: { rules, final: 'proxy' },
    },
    null,
    2
  );
}

export function draftRules(): unknown {
  return findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules']);
}

/** Count of a process that runs `CONFIG`: one per node. */
export const HITS = {
  seconds: 2 * 60 * 60,
  rules: [
    { index: 0, hits: 1234, counted: true },
    { index: 1, hits: 0, counted: false },
    { index: 2, hits: 5, counted: true },
  ],
  final: 0,
};

export function configHandlers(text = CONFIG, hits: typeof HITS = HITS) {
  return [
    http.get(ROUTE_ENDPOINT.hits(), () => HttpResponse.json(hits)),
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)),
    // The screen header opens the version history, and the apply bar polls the daemon.
    http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
  ];
}

/** Rules for editing and two sets that can be referred to. */
export const WITH_RULE_SETS = JSON.stringify(
  {
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
    ],
    route: {
      rules: EDIT_RULES,
      final: 'proxy',
      rule_set: [
        { type: 'remote', tag: 'github', format: 'binary', url: 'https://example.invalid/github.srs' },
        { type: 'remote', tag: 'geoip-cn', format: 'binary', url: 'https://example.invalid/geoip-cn.srs' },
      ],
    },
  },
  null,
  2
);
