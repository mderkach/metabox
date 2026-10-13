import type { LIST_KIND, LIST_SOURCE } from '../api/RuleSet.schema';

export const RULE_SET_TYPE = {
  Remote: 'remote',
  Local: 'local',
  Inline: 'inline',
} as const;

export const RULE_SET_FORMAT = {
  Binary: 'binary',
  Source: 'source',
} as const;

/** Extensions from which core derives the set format itself. */
export const SET_EXTENSION = {
  Binary: '.srs',
  Source: '.json',
} as const;

/** Provider list kinds: domains and addresses. Values are checked against the daemon contract. */
export const RULE_SET_LIST_KIND = {
  Geosite: 'geosite',
  Geoip: 'geoip',
} as const satisfies Record<string, (typeof LIST_KIND)[number]>;

/** Where the category listing comes from. Values are checked against the daemon contract. */
export const RULE_SET_LIST_SOURCE = {
  Snapshot: 'snapshot',
  Provider: 'provider',
} as const satisfies Record<string, (typeof LIST_SOURCE)[number]>;
