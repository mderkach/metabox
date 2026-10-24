import type { JSONPath } from 'jsonc-parser';

import { TAG_REFERENCE_LOOPS, TAG_REFERENCE_PATHS } from '@shared/api/generated';

import { NODE_LISTS, nodeNameOf, valueAt, type NodeListSection } from './Config.changes';
import { findValue, RULES_PATH } from './Config.model';

export const CONFIG_REFERENCE = {
  Rule: 'rule',
  Node: 'node',
  Setting: 'setting',
} as const;

/** A place in the config that names a node by its tag. `index` of a rule is from one. */
export type ConfigReference =
  | { kind: typeof CONFIG_REFERENCE.Rule; index: number }
  | { kind: typeof CONFIG_REFERENCE.Node; section: NodeListSection; name: string }
  | { kind: typeof CONFIG_REFERENCE.Setting; path: string };

const ARRAY_INDEX = '*';
const MAP_KEY = '{}';

function matches(pattern: readonly string[], segments: readonly string[]): boolean {
  return pattern.every((key, index) => key === segments[index] || (key === MAP_KEY && segments[index] !== ARRAY_INDEX));
}

function loopAt(segments: readonly string[]) {
  return TAG_REFERENCE_LOOPS.find(({ from }) => from.length < segments.length && matches(from, segments));
}

/** Whether the schema marks the value at `path` as a tag reference. */
function isReference(path: JSONPath): boolean {
  let segments = path.map((key) => (typeof key === 'number' ? ARRAY_INDEX : key));

  for (let loop = loopAt(segments); loop !== undefined; loop = loopAt(segments)) {
    segments = [...loop.to, ...segments.slice(loop.from.length)];
  }

  return TAG_REFERENCE_PATHS.some((pattern) => pattern.length === segments.length && matches(pattern, segments));
}

function collectPaths(value: unknown, tag: string, path: JSONPath, found: JSONPath[]): void {
  if (value === tag) {
    if (isReference(path)) {
      found.push(path);
    }

    return;
  }

  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;

    if (items.includes(tag) && isReference(path)) {
      found.push(path);

      return;
    }

    items.forEach((item, index) => {
      collectPaths(item, tag, [...path, index], found);
    });

    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      collectPaths(item, tag, [...path, key], found);
    }
  }
}

function startsWith(path: JSONPath, prefix: JSONPath): boolean {
  return prefix.length < path.length && prefix.every((key, index) => path[index] === key);
}

function toReference(root: unknown, path: JSONPath): ConfigReference {
  if (startsWith(path, RULES_PATH)) {
    return { kind: CONFIG_REFERENCE.Rule, index: Number(path[RULES_PATH.length]) + 1 };
  }

  const list = NODE_LISTS.find((item) => startsWith(path, item.path));

  if (list !== undefined) {
    const index = Number(path[list.path.length]);

    return {
      kind: CONFIG_REFERENCE.Node,
      section: list.section,
      name: nodeNameOf(valueAt(root, [...list.path, index]), index),
    };
  }

  return { kind: CONFIG_REFERENCE.Setting, path: path.join('.') };
}

/**
 * Places that name `tag` in a field the schema marks as a tag reference: a rule outbound,
 * a group member, `route.final`. A field that only happens to hold the same string is
 * not counted. Each place is named once.
 */
export function findReferences(text: string, tag: string): ConfigReference[] {
  const root = findValue(text, []);
  const paths: JSONPath[] = [];

  if (tag === '') {
    return [];
  }

  collectPaths(root, tag, [], paths);

  const seen = new Set<string>();

  return paths
    .map((path) => toReference(root, path))
    .filter((reference) => {
      const key = JSON.stringify(reference);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });
}
