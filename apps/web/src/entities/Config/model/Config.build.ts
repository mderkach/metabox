import { BUILD_TAG_OF_OPTION, BUILD_TAG_OF_TYPE } from '@shared/api/generated';

import { GENERIC_SECTIONS, readPath, type ConfigDocument } from './Config.model';
import { SECTION_REGISTRY } from './Config.registry';

/** A node whose type the binary on the device will not run. */
export interface UnbuiltNode {
  /** Section path in the document: `outbounds`, `dns.servers`. */
  section: string;
  index: number;
  /** Node tag; `null` means no tag, and the node is named by its number. */
  tag: string | null;
  type: string;
  /** Build tag without which the binary does not run this type. */
  buildTag: string;
}

function readString(node: object, key: string): string | null {
  const value: unknown = Reflect.get(node, key);

  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Document nodes that are not in the binary build. The document is read as is,
 * not through the schema: the warning is needed for a config that failed
 * parsing too.
 *
 * `tags` is `null` when the binary was not read: then nothing is known about
 * the build contents, and the list is empty, not full.
 */
export function findUnbuiltNodes(config: ConfigDocument | null, tags: readonly string[] | null): UnbuiltNode[] {
  if (config === null || tags === null) {
    return [];
  }

  const built = new Set(tags);
  const found: UnbuiltNode[] = [];

  for (const { section, registry } of SECTION_REGISTRY) {
    const { path } = GENERIC_SECTIONS[section];
    const nodes = readPath(config, path);
    const gates = BUILD_TAG_OF_TYPE[registry] ?? {};

    if (!Array.isArray(nodes)) {
      continue;
    }

    for (const [index, item] of nodes.entries()) {
      const node: unknown = item;

      if (typeof node !== 'object' || node === null) {
        continue;
      }

      const type = readString(node, 'type');
      const buildTag = type === null ? undefined : gates[type];

      if (type !== null && buildTag !== undefined && !built.has(buildTag)) {
        found.push({ section: path.join('.'), index, tag: readString(node, 'tag'), type, buildTag });
      }
    }
  }

  return found;
}

/** A config option the binary on the device will not run. */
export interface UnbuiltOption {
  /** Path of the node with the option: `outbounds[1].tls.utls`, `experimental.clash_api`. */
  path: string;
  /** Build tag without which the binary does not run this option. */
  buildTag: string;
}

/**
 * The tun stacks that need gVisor: `mixed` serves TCP with the same stack as
 * `gvisor`, and without the tag both fail with the same error (`NewStack` in
 * sing-tun).
 */
const GVISOR_STACKS = new Set(['gvisor', 'mixed']);

type OptionFinder = (config: ConfigDocument) => string[];

/**
 * One detector per key of the tag table. `satisfies` binds the set to
 * `BUILD_TAG_OF_OPTION`: an option added by the generator will not compile
 * without its own detector.
 */
const OPTION_FINDERS = {
  'experimental.clash_api': findSection(['experimental', 'clash_api']),
  'experimental.v2ray_api': findSection(['experimental', 'v2ray_api']),
  'tls.utls': findEnabledUTLS,
  'tun.stack': findGVisorStacks,
} satisfies Record<keyof typeof BUILD_TAG_OF_OPTION, OptionFinder>;

function findSection(path: readonly string[]): OptionFinder {
  return (config) => (readPath(config, path) === undefined ? [] : [path.join('.')]);
}

/**
 * uTLS travels in client TLS options and occurs in several sections, outbounds
 * and DNS servers, so it is found by walking the whole document: any node with
 * `tls.utls.enabled: true`.
 */
function findEnabledUTLS(config: ConfigDocument): string[] {
  const found: string[] = [];

  walkObjects(config, '', (node, path) => {
    const tls: unknown = Reflect.get(node, 'tls');

    if (typeof tls !== 'object' || tls === null) {
      return;
    }

    const utls: unknown = Reflect.get(tls, 'utls');

    if (typeof utls === 'object' && utls !== null && Reflect.get(utls, 'enabled') === true) {
      found.push(path === '' ? 'tls.utls' : `${path}.tls.utls`);
    }
  });

  return found;
}

function findGVisorStacks(config: ConfigDocument): string[] {
  const inbounds = readPath(config, ['inbounds']);

  if (!Array.isArray(inbounds)) {
    return [];
  }

  const found: string[] = [];

  for (const [index, item] of inbounds.entries()) {
    const node: unknown = item;

    if (typeof node !== 'object' || node === null || readString(node, 'type') !== 'tun') {
      continue;
    }

    const stack = readString(node, 'stack');

    if (stack !== null && GVISOR_STACKS.has(stack)) {
      found.push(`inbounds[${String(index)}].stack`);
    }
  }

  return found;
}

function walkObjects(node: unknown, path: string, visit: (node: object, path: string) => void): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }

  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      walkObjects(item, `${path}[${String(index)}]`, visit);
    }

    return;
  }

  visit(node, path);

  for (const [key, value] of Object.entries(node)) {
    walkObjects(value, path === '' ? key : `${path}.${key}`, visit);
  }
}

/**
 * Document options that are not in the binary build. Read as is, by the same
 * rules as `findUnbuiltNodes`: `tags` is `null` when the binary was not read,
 * and then the list is empty, not full.
 */
export function findUnbuiltOptions(config: ConfigDocument | null, tags: readonly string[] | null): UnbuiltOption[] {
  if (config === null || tags === null) {
    return [];
  }

  const built = new Set(tags);
  const found: UnbuiltOption[] = [];

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys of a closed literal: narrowing to its union
  const options = Object.keys(OPTION_FINDERS) as (keyof typeof OPTION_FINDERS)[];

  for (const option of options) {
    const buildTag = BUILD_TAG_OF_OPTION[option];

    if (built.has(buildTag)) {
      continue;
    }

    for (const path of OPTION_FINDERS[option](config)) {
      found.push({ path, buildTag });
    }
  }

  return found;
}

/** Option tag table by path: a plain `Map` is read with a string without casting to the literal keys. */
const OPTION_TAGS: ReadonlyMap<string, string> = new Map(Object.entries(BUILD_TAG_OF_OPTION));

/**
 * Build tag of an option missing from the binary build, by the field path
 * inside a node: `tls.utls` and everything under it is `with_utls`. The path is
 * matched against the `BUILD_TAG_OF_OPTION` keys together with ancestors, so a
 * field lifted by the form out of its group (`tls.utls.fingerprint`) is marked
 * the same way as the group.
 *
 * `null` means the path is not an option from the table, the tag is in the
 * build, or the binary was not read (`tags` is `null`): then nothing is known
 * about the build contents.
 */
export function unbuiltOptionOf(path: string, tags: readonly string[] | null): string | null {
  if (tags === null) {
    return null;
  }

  const keys = path.split('.');

  for (let depth = 1; depth <= keys.length; depth += 1) {
    const tag = OPTION_TAGS.get(keys.slice(0, depth).join('.'));

    if (tag !== undefined) {
      return tags.includes(tag) ? null : tag;
    }
  }

  return null;
}
