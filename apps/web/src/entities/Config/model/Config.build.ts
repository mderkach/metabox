import { BUILD_TAG_OF_TYPE } from '@shared/api/generated';

import type { ConfigDocument } from './Config.model';

/** Узел, тип которого бинарь на устройстве не запустит. */
export interface UnbuiltNode {
  /** Путь секции в документе: `outbounds`, `dns.servers`. */
  section: string;
  index: number;
  /** Тег узла; `null` — тега нет, узел называется номером. */
  tag: string | null;
  type: string;
  /** Build-тег, без которого бинарь этот тип не запускает. */
  buildTag: string;
}

/** Секция документа и реестр форка, из которого она берёт типы. */
const SECTION_REGISTRY: readonly { path: readonly string[]; registry: string }[] = [
  { path: ['inbounds'], registry: 'inbound' },
  { path: ['outbounds'], registry: 'outbound' },
  { path: ['endpoints'], registry: 'endpoint' },
  { path: ['providers'], registry: 'provider' },
  { path: ['services'], registry: 'service' },
  { path: ['certificate_providers'], registry: 'certificate_provider' },
  { path: ['dns', 'servers'], registry: 'dns' },
];

function readPath(config: ConfigDocument, path: readonly string[]): unknown {
  let node: unknown = config;

  for (const key of path) {
    node = typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined;
  }

  return node;
}

function readString(node: object, key: string): string | null {
  const value: unknown = Reflect.get(node, key);

  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Узлы документа, которых нет в сборке бинаря. Документ читается как есть, а
 * не через схему: предупреждение нужно и конфигу, который разбор не прошёл.
 *
 * `tags` — `null`, когда бинарь не прочитан: тогда о составе сборки ничего не
 * известно, и список пуст, а не полон.
 */
export function findUnbuiltNodes(config: ConfigDocument | null, tags: readonly string[] | null): UnbuiltNode[] {
  if (config === null || tags === null) {
    return [];
  }

  const built = new Set(tags);
  const found: UnbuiltNode[] = [];

  for (const { path, registry } of SECTION_REGISTRY) {
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
