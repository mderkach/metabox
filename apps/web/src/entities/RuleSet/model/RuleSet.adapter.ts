import { RuleSetSchema } from '@shared/api/generated';
import { MS_IN_SECOND } from '@shared/lib/time';

import { LIST_KIND, LIST_SOURCE, type RuleSetCatalogWire, type RuleSetListWire } from '../api/RuleSet.schema';
import { describeURL } from './RuleSet.catalog';
import { RULE_SET_LIST_SOURCE, RULE_SET_TYPE } from './RuleSet.constants';
import type {
  RuleSetCatalog,
  RuleSetList,
  RuleSetListKind,
  RuleSetListSource,
  RuleSetRow,
  RuleSetSource,
  RuleSetType,
} from './RuleSet.model';

/** A set without `type` is read by core as remote. */
const DEFAULT_TYPE: RuleSetType = RULE_SET_TYPE.Remote;

const TYPES = new Set<string>(Object.values(RULE_SET_TYPE));

function toType(raw: unknown): RuleSetType {
  if (typeof raw === 'string' && TYPES.has(raw)) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the value was checked against the set by the line above
    return raw as RuleSetType;
  }

  return DEFAULT_TYPE;
}

function toText(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

function toOptionalText(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Where a set keeps its source: for a remote one it is a URL, for a local one a
 * path on the device, and for an inline one the rules are in the config itself.
 */
function toLocation(node: object, type: RuleSetType): string {
  if (type === RULE_SET_TYPE.Local) {
    return toText(Reflect.get(node, 'path'));
  }

  return type === RULE_SET_TYPE.Remote ? toText(Reflect.get(node, 'url')) : '';
}

/**
 * The node core downloads the set through. The field is declared twice: the
 * deprecated `download_detour` and `detour` inside `http_client`; the panel
 * reads both because either occurs in a foreign config.
 */
function toDetour(node: object): string | null {
  const own = toOptionalText(Reflect.get(node, 'download_detour'));

  if (own !== null) {
    return own;
  }

  const client: unknown = Reflect.get(node, 'http_client');

  if (typeof client !== 'object' || client === null) {
    return null;
  }

  return toOptionalText(Reflect.get(client, 'detour'));
}

const LIST_KINDS = new Set<string>(LIST_KIND);
const LIST_SOURCES = new Set<string>(LIST_SOURCE);

function isListKind(value: string): value is RuleSetListKind {
  return LIST_KINDS.has(value);
}

function isListSource(value: string): value is RuleSetListSource {
  return LIST_SOURCES.has(value);
}

function toList(wire: RuleSetListWire): RuleSetList | null {
  if (!isListKind(wire.kind)) {
    return null;
  }

  return {
    kind: wire.kind,
    prefix: wire.prefix,
    mirrors: wire.mirrors,
    featured: wire.featured,
    categories: wire.categories,
    source: isListSource(wire.source) ? wire.source : RULE_SET_LIST_SOURCE.Snapshot,
    updatedAt: wire.updated_at > 0 ? new Date(wire.updated_at * MS_IN_SECOND) : null,
  };
}

/**
 * The daemon catalog into the screen model. A list of an unfamiliar kind is
 * skipped and does not drop the catalog: the daemon may be newer than the
 * panel.
 */
export function toRuleSetCatalog(wire: RuleSetCatalogWire): RuleSetCatalog {
  return {
    providers: wire.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      lists: provider.lists.map(toList).filter((list) => list !== null),
    })),
  };
}

const NO_SOURCE: RuleSetSource = { providerId: null, providerName: null, kind: null, category: null };

/** The node is accepted by the fork schema: it has a form, not only the text mode. */
export function isRuleSetRecognized(node: unknown): boolean {
  return RuleSetSchema.safeParse(node).success;
}

/**
 * Expands `route.rule_set` into list rows.
 *
 * How many rules refer to a set is counted outside and arrives as a map: the
 * sets slice itself knows nothing about rules, and the screen needs this in one
 * pass.
 */
export function toRuleSetRowsFromNodes(
  nodes: readonly unknown[],
  usage: ReadonlyMap<string, number>,
  catalog: RuleSetCatalog
): RuleSetRow[] {
  const rows: RuleSetRow[] = [];

  for (const [position, node] of nodes.entries()) {
    // The position is taken in the source array: an edit addresses the node in
    // the file by it, and a skipped non-object would shift the following edits
    // onto other nodes.
    if (typeof node !== 'object' || node === null) {
      continue;
    }

    const type = toType(Reflect.get(node, 'type'));
    const location = toLocation(node, type);
    const tag = toText(Reflect.get(node, 'tag'));

    rows.push({
      id: String(position),
      index: position,
      tag,
      type,
      format: toText(Reflect.get(node, 'format')),
      location,
      source: type === RULE_SET_TYPE.Remote ? describeURL(catalog, location) : NO_SOURCE,
      updateInterval: toOptionalText(Reflect.get(node, 'update_interval')),
      detour: toDetour(node),
      usedBy: usage.get(tag) ?? 0,
      recognized: isRuleSetRecognized(node),
    });
  }

  return rows;
}

/**
 * How many rules refer to each set tag.
 *
 * A rule's `rule_set` condition is a string or a list of strings, and in a
 * logical rule it lies in nested branches: a rule that refers to a set from
 * inside a group refers to it no less than a direct one.
 */
export function countRuleSetUsage(rules: readonly unknown[]): Map<string, number> {
  const usage = new Map<string, number>();

  for (const rule of rules) {
    for (const tag of collectTags(rule)) {
      usage.set(tag, (usage.get(tag) ?? 0) + 1);
    }
  }

  return usage;
}

/** Set tags a rule refers to, without repeats within one. */
function collectTags(rule: unknown): Set<string> {
  const tags = new Set<string>();

  if (typeof rule !== 'object' || rule === null) {
    return tags;
  }

  const own: unknown = Reflect.get(rule, 'rule_set');

  if (typeof own === 'string') {
    tags.add(own);
  } else if (Array.isArray(own)) {
    for (const item of own) {
      if (typeof item === 'string') tags.add(item);
    }
  }

  const nested: unknown = Reflect.get(rule, 'rules');

  if (Array.isArray(nested)) {
    for (const child of nested) {
      for (const tag of collectTags(child)) {
        tags.add(tag);
      }
    }
  }

  return tags;
}
