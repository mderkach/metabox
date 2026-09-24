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

/** Расширения, по которым ядро само выводит формат набора. */
export const SET_EXTENSION = {
  Binary: '.srs',
  Source: '.json',
} as const;

/** Виды списков у поставщика: домены и адреса. Значения сверяются с контрактом демона. */
export const RULE_SET_LIST_KIND = {
  Geosite: 'geosite',
  Geoip: 'geoip',
} as const satisfies Record<string, (typeof LIST_KIND)[number]>;

/** Откуда перечень категорий. Значения сверяются с контрактом демона. */
export const RULE_SET_LIST_SOURCE = {
  Snapshot: 'snapshot',
  Provider: 'provider',
} as const satisfies Record<string, (typeof LIST_SOURCE)[number]>;
