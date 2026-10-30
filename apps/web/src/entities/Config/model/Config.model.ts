import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  type FormattingOptions,
  type JSONPath,
  type ModificationOptions,
  type ParseError,
} from 'jsonc-parser';

import type { Config } from '@shared/api/generated';
import { detectIndent } from '@shared/lib/jsonc';

import { insertElement, moveElement, nameElement, readElementNames, removeElement } from './Config.array';

/** Indent and line break of the source file: inserted nodes are formatted like the rest of it. */
function detectFormatting(text: string): FormattingOptions {
  return { ...detectIndent(text), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

function edit(text: string, path: JSONPath, value: unknown, options?: ModificationOptions): string {
  return applyEdits(text, modify(text, path, value, { formattingOptions: detectFormatting(text), ...options }));
}

function isValidDocument(text: string): boolean {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowTrailingComma: true });

  return root !== undefined && errors.length === 0;
}

/**
 * Writes a value at a path without touching the rest of the text.
 *
 * The node at the path may be absent, and then it is created. Returns the new
 * text: it is exactly what goes as the `POST /api/apply` body, so rebuilding
 * the config from the parsed model is not allowed.
 */
export function setValue(text: string, path: JSONPath, value: unknown): string {
  return edit(text, path, value);
}

/**
 * Deletes a node by path: an array element or an object member. An element of a
 * list goes together with its comma and comments, and the neighbours keep their
 * text: `modify` would reformat the next one. `null` refuses an unsafe edit.
 */
export function removeValue(text: string, path: JSONPath): string | null {
  if (!isValidDocument(text)) return null;

  const removed = removeElement(text, path);

  return removed === undefined ? edit(text, path, undefined) : removed;
}

/** Reads a node value by path. `undefined` means no node. */
export function findValue(text: string, path: JSONPath): unknown {
  const root = parseTree(text);

  if (root === undefined) {
    return undefined;
  }

  const node = findNodeAtLocation(root, path);

  return node === undefined ? undefined : getNodeValue(node);
}

/**
 * Inserts an element into an array at the position from the path, instead of
 * rewriting the one that is there. The neighbours keep their text: `modify`
 * would reformat the previous one; it is left only for a list that is empty or
 * absent, where there are no neighbours. `null` refuses an unsafe edit.
 */
export function insertValue(text: string, path: JSONPath, value: unknown): string | null {
  if (!isValidDocument(text)) return null;

  const inserted = insertElement(text, path, value, detectFormatting(text));

  return inserted === undefined ? edit(text, path, value, { isArrayInsertion: true }) : inserted;
}

/**
 * Moves an element with its source text and comments. `null` refuses a move whose
 * layout cannot be preserved; a missing element or the same position is a no-op.
 */
export function moveValue(text: string, path: JSONPath, from: number, to: number): string | null {
  if (from === to || findValue(text, [...path, from]) === undefined) return text;

  return moveElement(text, path, from, to);
}

/**
 * Names a list element with a line comment right above it; an empty name
 * removes the comment. `null` refuses an unsafe edit.
 */
export function nameValue(text: string, path: JSONPath, name: string): string | null {
  if (!isValidDocument(text)) return null;

  return nameElement(text, path, name, detectFormatting(text));
}

/**
 * Where routing rules lie in the document. Addressing config nodes is Config
 * slice knowledge: in screens and forms it would drift apart in copies, and an
 * off-by-one in one of them would open the neighboring rule.
 */
export const RULES_PATH: JSONPath = ['route', 'rules'];

/** Path of a rule node by its number in the interface, counting from one. */
export function ruleNodePath(index: number): JSONPath {
  return [...RULES_PATH, index - 1];
}

/**
 * Document rules as is. A node the schema did not accept stays in the list: one
 * unfamiliar rule must not hide the others.
 */
export function readRules(text: string): unknown[] {
  const rules: unknown = findValue(text, RULES_PATH);

  return Array.isArray(rules) ? rules : [];
}

/**
 * Rule names, one per node of `readRules`: sing-box has no name field on a
 * rule, so the name is the line comment above the rule node. `null` means none.
 */
export function readRuleNames(text: string): (string | null)[] {
  return readElementNames(text, RULES_PATH);
}

/** Where rule sets lie in the document. */
export const RULE_SETS_PATH: JSONPath = ['route', 'rule_set'];

/** Path of a set node by its position in the list, counting from zero. */
export function ruleSetNodePath(index: number): JSONPath {
  return [...RULE_SETS_PATH, index];
}

/** Document sets as is; a node not accepted by the schema does not drop out of the list. */
export function readRuleSets(text: string): unknown[] {
  const sets: unknown = findValue(text, RULE_SETS_PATH);

  return Array.isArray(sets) ? sets : [];
}

/**
 * Document set tags are what a rule can refer to. A node without a tag is
 * skipped: there is nothing to refer to it by.
 */
export function readRuleSetTags(text: string): string[] {
  return readRuleSets(text)
    .map((node): unknown => (typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined))
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
}

/** Where the set cache lies: without it an unavailable provider aborts startup. */
export const CACHE_FILE_PATH: JSONPath = ['experimental', 'cache_file', 'enabled'];

/** Whether the set cache is enabled in the document. */
export function hasRuleSetCache(text: string): boolean {
  return findValue(text, CACHE_FILE_PATH) === true;
}

/**
 * Config document in the app model. The name is our own, not the fork's: a type
 * rename in the schema is fixed here, not in every screen that reads the
 * document.
 */
export type ConfigDocument = Config;

/** Document sections that the panel lists as tabs. */
export const CONFIG_SECTION = {
  Route: 'route',
  RuleSet: 'ruleSet',
  Inbounds: 'inbounds',
  Outbounds: 'outbounds',
  Providers: 'providers',
  Endpoints: 'endpoints',
  Dns: 'dns',
  DnsRules: 'dnsRules',
  Services: 'services',
  Ntp: 'ntp',
  Certificate: 'certificate',
  CertificateProviders: 'certificateProviders',
  HttpClients: 'httpClients',
  NetworkNamespaces: 'networkNamespaces',
  Log: 'log',
  Experimental: 'experimental',
} as const;

export type ConfigSection = (typeof CONFIG_SECTION)[keyof typeof CONFIG_SECTION];

/**
 * Sections without their own screen: where their nodes lie and whether they are
 * edited as a list. `route` and `ruleSet` have their own screens and are not
 * here; `dns` is split into server and rule lists, its scalar fields are
 * `Config.settings`.
 */
export const GENERIC_SECTIONS = {
  [CONFIG_SECTION.Inbounds]: { kind: 'list', path: ['inbounds'] },
  [CONFIG_SECTION.Outbounds]: { kind: 'list', path: ['outbounds'] },
  [CONFIG_SECTION.Providers]: { kind: 'list', path: ['providers'] },
  [CONFIG_SECTION.Endpoints]: { kind: 'list', path: ['endpoints'] },
  [CONFIG_SECTION.Dns]: { kind: 'list', path: ['dns', 'servers'] },
  [CONFIG_SECTION.DnsRules]: { kind: 'list', path: ['dns', 'rules'] },
  [CONFIG_SECTION.Services]: { kind: 'list', path: ['services'] },
  [CONFIG_SECTION.Ntp]: { kind: 'object', path: ['ntp'] },
  [CONFIG_SECTION.Certificate]: { kind: 'object', path: ['certificate'] },
  [CONFIG_SECTION.CertificateProviders]: { kind: 'list', path: ['certificate_providers'] },
  [CONFIG_SECTION.HttpClients]: { kind: 'list', path: ['http_clients'] },
  [CONFIG_SECTION.NetworkNamespaces]: { kind: 'list', path: ['network_namespaces'] },
  [CONFIG_SECTION.Log]: { kind: 'object', path: ['log'] },
  [CONFIG_SECTION.Experimental]: { kind: 'object', path: ['experimental'] },
} as const satisfies Partial<Record<ConfigSection, { kind: 'list' | 'object'; path: JSONPath }>>;

export type GenericSection = keyof typeof GENERIC_SECTIONS;

export function isGenericSection(value: string): value is GenericSection {
  return value in GENERIC_SECTIONS;
}

/**
 * Section nodes as is, from the text: a node the schema did not accept does not
 * drop out of the list. An object section yields one node; a section that is
 * not in the file yields an empty list.
 */
export function readSectionNodes(text: string, section: GenericSection): unknown[] {
  const shape = GENERIC_SECTIONS[section];
  const value = findValue(text, shape.path);

  if (shape.kind === 'object') {
    return value === undefined ? [] : [value];
  }

  return Array.isArray(value) ? value : [];
}

/** Path of a section node by its position; an object section has one position. */
export function sectionNodePath(section: GenericSection, index: number): JSONPath {
  const shape = GENERIC_SECTIONS[section];

  return shape.kind === 'object' ? shape.path : [...shape.path, index];
}

/**
 * Value at a path in the parsed document; `undefined` means no node.
 *
 * The document goes as is, not through the schema: a node the schema did not
 * accept is read too.
 */
export function readPath(config: ConfigDocument, path: readonly string[]): unknown {
  let node: unknown = config;

  for (const key of path) {
    node = typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined;
  }

  return node;
}

/**
 * How many elements are in a section; `null` means there is nothing to count:
 * an object section has no list.
 *
 * Document node addressing lives in the owner slice: otherwise a section rename
 * in the fork would be fixed across all the screens that show it.
 */
export function sectionSize(config: ConfigDocument | null, section: ConfigSection): number | null {
  if (config === null) {
    return null;
  }

  if (section === CONFIG_SECTION.Route) {
    return config.route?.rules?.length ?? 0;
  }

  if (section === CONFIG_SECTION.RuleSet) {
    return config.route?.rule_set?.length ?? 0;
  }

  const shape = GENERIC_SECTIONS[section];

  if (shape.kind === 'object') {
    return null;
  }

  const nodes = readPath(config, shape.path);

  return Array.isArray(nodes) ? nodes.length : 0;
}

interface TaggedOutbound {
  tag: string;
  node: object;
}

/**
 * Document outbounds that have a tag. Nodes are read as is, not through the
 * schema: the document may fail parsing as a whole, and the node list is needed
 * then too.
 */
function toTaggedOutbounds(config: ConfigDocument | null): TaggedOutbound[] {
  const outbounds: unknown = config?.outbounds;

  if (!Array.isArray(outbounds)) {
    return [];
  }

  const tagged: TaggedOutbound[] = [];

  for (const item of outbounds) {
    const node: unknown = item;

    if (typeof node !== 'object' || node === null) {
      continue;
    }

    const tag: unknown = Reflect.get(node, 'tag');

    if (typeof tag === 'string' && tag.length > 0) {
      tagged.push({ tag, node });
    }
  }

  return tagged;
}

/** Document outbound tags; a node without a tag is skipped. */
export function toOutboundTags(config: ConfigDocument | null): string[] {
  return toTaggedOutbounds(config).map((outbound) => outbound.tag);
}

/**
 * Where traffic that matched no rule goes: `route.final`, and without it the
 * first outbound, as sing-box decides. `null` means there is no document, or
 * the schema did not accept it, or it has neither.
 */
export function toFinalOutbound(config: ConfigDocument | null): string | null {
  const final = config?.route?.final;

  if (final !== undefined && final.length > 0) {
    return final;
  }

  return toOutboundTags(config).at(0) ?? null;
}

/**
 * Outbound type by its tag. The type is the only exact indication of where a
 * node leads traffic: the tag is written by the user, and one cannot judge by
 * the name. What the type means for the interface is decided by the consumer of
 * the map.
 *
 * A node without a tag or without a type is not in the map: there is nothing to refer to it by.
 */
export function toOutboundTypes(config: ConfigDocument | null): ReadonlyMap<string, string> {
  const types = new Map<string, string>();

  for (const outbound of toTaggedOutbounds(config)) {
    const type: unknown = Reflect.get(outbound.node, 'type');

    if (typeof type === 'string' && type.length > 0) {
      types.set(outbound.tag, type);
    }
  }

  return types;
}

/** Config history entry in the form the screen shows it. */
export interface ConfigVersion {
  id: number;
  size: number;
  sum: string;
  /**
   * The version matches the file on the device byte for byte. There may be
   * several: the daemon drops a repeat only relative to the newest entry.
   */
  current: boolean;
  /**
   * Epoch milliseconds; `null` means there is no timestamp: the router starts
   * from the epoch, and before NTP sync the save date lies. The order is still
   * set by the version number.
   *
   * A number, not `Date`: the model lives in the Query cache, and structural
   * sharing does not keep a reference to an object outside plain structures, so
   * the version list would be recreated on every response even when the history
   * did not change.
   */
  savedAt: number | null;
}

export interface ConfigVersions {
  versions: ConfigVersion[];
  currentListsUnavailable: boolean;
}

export interface CheckFailure {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Apply with lists rejected before writing: the sing-box service resolves a
 * relative list file path from its own working directory, and it did not match
 * the config directory.
 */
export interface WorkdirMismatch {
  workdir: string;
  configDir: string;
}
