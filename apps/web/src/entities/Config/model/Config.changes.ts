import type { JSONPath } from 'jsonc-parser';

import {
  CONFIG_SECTION,
  findValue,
  GENERIC_SECTIONS,
  RULE_SETS_PATH,
  RULES_PATH,
  type ConfigSection,
} from './Config.model';
import { diffNode } from './Config.patch';

export const CONFIG_CHANGE = {
  Added: 'added',
  Removed: 'removed',
  Changed: 'changed',
  Setting: 'setting',
} as const;

/** Lists whose nodes are told apart by `tag`; a node without one is named by its number. */
export const NODE_LISTS = [
  { section: CONFIG_SECTION.RuleSet, path: RULE_SETS_PATH },
  { section: CONFIG_SECTION.Inbounds, path: GENERIC_SECTIONS.inbounds.path },
  { section: CONFIG_SECTION.Outbounds, path: GENERIC_SECTIONS.outbounds.path },
  { section: CONFIG_SECTION.Providers, path: GENERIC_SECTIONS.providers.path },
  { section: CONFIG_SECTION.Endpoints, path: GENERIC_SECTIONS.endpoints.path },
  { section: CONFIG_SECTION.Dns, path: GENERIC_SECTIONS.dns.path },
  { section: CONFIG_SECTION.DnsRules, path: GENERIC_SECTIONS.dnsRules.path },
  { section: CONFIG_SECTION.Services, path: GENERIC_SECTIONS.services.path },
  { section: CONFIG_SECTION.CertificateProviders, path: GENERIC_SECTIONS.certificateProviders.path },
  { section: CONFIG_SECTION.HttpClients, path: GENERIC_SECTIONS.httpClients.path },
  { section: CONFIG_SECTION.NetworkNamespaces, path: GENERIC_SECTIONS.networkNamespaces.path },
] as const satisfies readonly { section: ConfigSection; path: JSONPath }[];

export type NodeListSection = (typeof NODE_LISTS)[number]['section'];

/** Screen of a top-level key that is not a node list: route parameters live on the rules screen, `dns.*` beside DNS servers. */
const SETTING_SECTION = new Map<unknown, ConfigSection>([
  ['route', CONFIG_SECTION.Route],
  ['dns', CONFIG_SECTION.Dns],
  ['ntp', CONFIG_SECTION.Ntp],
  ['certificate', CONFIG_SECTION.Certificate],
  ['log', CONFIG_SECTION.Log],
  ['experimental', CONFIG_SECTION.Experimental],
]);

/**
 * A config edit outside routing rules, which have their own summary. `name` is
 * the node tag, or its number from one when the node has no tag; `fields` are
 * the top-level keys that changed.
 */
export type ConfigChange =
  | { kind: typeof CONFIG_CHANGE.Added | typeof CONFIG_CHANGE.Removed; section: NodeListSection; name: string }
  | { kind: typeof CONFIG_CHANGE.Changed; section: NodeListSection; name: string; fields: string[] }
  /** A value outside node lists; `from` and `to` are `undefined` when the key is absent. */
  | { kind: typeof CONFIG_CHANGE.Setting; section: ConfigSection | null; path: string; from: unknown; to: unknown };

interface NamedNode {
  name: string;
  node: unknown;
}

/** Node name in a summary: its tag, or its number from one. */
export function nodeNameOf(node: unknown, index: number): string {
  const tag: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined;

  return typeof tag === 'string' && tag !== '' ? tag : String(index + 1);
}

function toNamedNodes(value: unknown): NamedNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const nodes: readonly unknown[] = value;

  return nodes.map((node, index) => ({ name: nodeNameOf(node, index), node }));
}

function toNodeChanges(section: NodeListSection, applied: unknown, draft: unknown): ConfigChange[] {
  const before = new Map(toNamedNodes(applied).map((item) => [item.name, item.node]));
  const after = toNamedNodes(draft);
  const kept = new Set(after.map((item) => item.name));

  const changes = after.flatMap(({ name, node }): ConfigChange[] => {
    if (!before.has(name)) {
      return [{ kind: CONFIG_CHANGE.Added, section, name }];
    }

    const fields = [...new Set(diffNode([], before.get(name), node).map((edit) => String(edit.path[0] ?? '')))];

    return fields.length === 0 ? [] : [{ kind: CONFIG_CHANGE.Changed, section, name, fields }];
  });

  const removed = [...before.keys()]
    .filter((name) => !kept.has(name))
    .map((name): ConfigChange => ({ kind: CONFIG_CHANGE.Removed, section, name }));

  return [...changes, ...removed];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Value at `path` in an already parsed document; `undefined` means no node. */
export function valueAt(root: unknown, path: JSONPath): unknown {
  return path.reduce<unknown>(
    (node, key) => (isRecord(node) || Array.isArray(node) ? Reflect.get(node, key) : undefined),
    root
  );
}

function startsWith(path: JSONPath, prefix: JSONPath): boolean {
  return prefix.every((key, index) => path[index] === key);
}

/**
 * Edits of the draft against the applied text, named by node and parameter
 * rather than by line. Routing rules are left out: `toRuleChanges` names them.
 * A text whose root is not an object gives no changes.
 */
export function toConfigChanges(applied: string, draft: string): ConfigChange[] {
  const before = findValue(applied, []);
  const after = findValue(draft, []);

  if (!isRecord(before) || !isRecord(after)) {
    return [];
  }

  const nodes = NODE_LISTS.flatMap(({ section, path }) =>
    toNodeChanges(section, valueAt(before, path), valueAt(after, path))
  );
  const skipped = [RULES_PATH, ...NODE_LISTS.map(({ path }) => path)];

  const settings = diffNode([], before, after)
    .filter((edit) => !skipped.some((prefix) => startsWith(edit.path, prefix)))
    .map((edit): ConfigChange => ({
      kind: CONFIG_CHANGE.Setting,
      section: SETTING_SECTION.get(edit.path[0]) ?? null,
      path: edit.path.join('.'),
      from: valueAt(before, edit.path),
      to: edit.value,
    }));

  return [...nodes, ...settings];
}
