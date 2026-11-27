import type { LIST_KIND, LIST_SOURCE } from '../api/RuleSet.schema';
import { RULE_SET_FORMAT, RULE_SET_TYPE, SET_EXTENSION } from './RuleSet.constants';

export type RuleSetType = (typeof RULE_SET_TYPE)[keyof typeof RULE_SET_TYPE];
export type RuleSetFormat = (typeof RULE_SET_FORMAT)[keyof typeof RULE_SET_FORMAT];

/** List kind: domains (`geosite`) or addresses (`geoip`); the set is declared by the daemon. */
export type RuleSetListKind = (typeof LIST_KIND)[number];

/** Where the category listing comes from: a build snapshot or a check against the provider. */
export type RuleSetListSource = (typeof LIST_SOURCE)[number];

/** Provider mirror: the main address is not always reachable from Russia. */
export interface RuleSetMirror {
  id: string;
  name: string;
  /** Start of the URL up to the file name, with a trailing slash. */
  base: string;
}

export interface RuleSetList {
  kind: RuleSetListKind;
  /** File name prefix: `geosite-` + category + `.srs`. */
  prefix: string;
  mirrors: RuleSetMirror[];
  /** What to show while the category field is empty, from general to specific. */
  featured: string[];
  /** All categories for which the provider has a file, alphabetically. */
  categories: string[];
  source: RuleSetListSource;
  /** When the listing was checked against the provider, for a snapshot when it was built; `null` means unknown. */
  updatedAt: Date | null;
}

export interface RuleSetProvider {
  id: string;
  name: string;
  lists: RuleSetList[];
}

/** Catalog of ready-made sets. Owned by the daemon: it also checks it against providers. */
export interface RuleSetCatalog {
  providers: RuleSetProvider[];
}

/** Where a set address came from: a recognized provider or a foreign address. */
export interface RuleSetSource {
  /** Provider identifier from the catalog; `null` means the address was not built from a template. */
  providerId: string | null;
  /** Provider name for display; `null` means the provider is not recognized. */
  providerName: string | null;
  /** List kind; `null` means the provider is not recognized. */
  kind: RuleSetListKind | null;
  /** Category name at the provider; `null` means it cannot be extracted from the address. */
  category: string | null;
}

export type RuleSetDescription =
  | { kind: RuleSetListKind; providerName: string; category: string; fileName: string; mirrorHost: string | null }
  | { kind: 'remote'; host: string | null; fileName: string | null }
  | { kind: 'local'; path: string }
  | { kind: 'inline' };

export interface RuleSetUsage {
  kind: 'route' | 'dns';
  /** Position of the parent rule in its list, counting from one. */
  number: number;
  name: string | null;
}

export interface RuleSetFileStat {
  /** Size in bytes. */
  size: number;
  /** Modification time, epoch milliseconds; `null` means the device clock was not set at the write. */
  modifiedAt: number | null;
}

export interface RuleSetRow {
  /** Position in `route.rule_set`: sets have no identifier of their own. */
  id: string;
  index: number;
  /** Set name: rules refer to it by it. Empty means the node has no tag. */
  tag: string;
  type: RuleSetType;
  /** `binary` or `source`; empty means the field is not set and core decides. */
  format: string;
  /** Address for `remote`, path for `local`, empty string for `inline`. */
  location: string;
  source: RuleSetSource;
  description: RuleSetDescription;
  /** How often core redownloads the set; `null` means the interval is not set. */
  updateInterval: string | null;
  /** Which node to download through; `null` means directly. */
  detour: string | null;
  usage: readonly RuleSetUsage[];
  /** How many routing and DNS rules refer to this tag. */
  usedBy: number;
  /**
   * The file on the device. `null` means unknown: only the daemon's own list files in
   * `rule-sets/` are visible to it, a remote set lives in the sing-box cache.
   */
  file: RuleSetFileStat | null;
  /**
   * The node is accepted by the schema. False means it has a field the schema
   * does not know: it is shown incompletely and edited as text.
   */
  recognized: boolean;
}

/**
 * Format that core derives from the address itself: `.srs` is binary, `.json`
 * is source. An empty string means there is nothing to derive from and the
 * format has to be set explicitly, otherwise the set will not be read.
 *
 * The rule repeats the fork's `ruleSetDefaultFormat`. The repeat is deliberate:
 * the panel must know when the field can be omitted, since a written value
 * equal to the derived one would add an edit to the diff that the user did not
 * make.
 */
/**
 * Resolves the relative path as the core does after expanding `{tag}`.
 * Only files directly inside the managed `rule-sets/` directory belong to the Apply envelope.
 */
export function localListFile(node: unknown): string | null {
  if (typeof node !== 'object' || node === null || Reflect.get(node, 'type') !== RULE_SET_TYPE.Local) {
    return null;
  }

  const path: unknown = Reflect.get(node, 'path');
  const tag: unknown = Reflect.get(node, 'tag');
  if (typeof path !== 'string' || (path.includes('{tag}') && (typeof tag !== 'string' || tag === ''))) {
    return null;
  }

  const expanded = typeof tag === 'string' ? path.replaceAll('{tag}', () => tag) : path;
  if (expanded.startsWith('/')) return null;

  const parts: string[] = [];
  for (const part of expanded.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) return null;
    } else if (part !== '' && part !== '.') {
      parts.push(part);
    }
  }

  const [directory, ...subpath] = parts;
  return directory === 'rule-sets' && subpath.length === 1 ? subpath[0] : null;
}

export function defaultFormatOf(url: string): RuleSetFormat | '' {
  const path = url.split(/[?#]/u, 1)[0];

  if (path.endsWith(SET_EXTENSION.Binary)) {
    return RULE_SET_FORMAT.Binary;
  }

  return path.endsWith(SET_EXTENSION.Source) ? RULE_SET_FORMAT.Source : '';
}

export interface CachedRuleSet {
  tag: string;
  state: string;
  checkedAt: number | undefined;
  size: number | undefined;
  otherAddress: boolean;
}
