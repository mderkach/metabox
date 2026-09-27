import { BUILD_TAG_OF_OPTION, BUILD_TAG_OF_TYPE } from '@shared/api/generated';

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

/** Опция конфига, которую бинарь на устройстве не запустит. */
export interface UnbuiltOption {
  /** Путь узла с опцией: `outbounds[1].tls.utls`, `experimental.clash_api`. */
  path: string;
  /** Build-тег, без которого бинарь эту опцию не запускает. */
  buildTag: string;
}

/**
 * Стеки tun, которым нужен gVisor: `mixed` обслуживает TCP тем же стеком,
 * что и `gvisor`, и без тега оба отвечают одной ошибкой (`NewStack` в
 * sing-tun).
 */
const GVISOR_STACKS = new Set(['gvisor', 'mixed']);

type OptionFinder = (config: ConfigDocument) => string[];

/**
 * По детектору на каждый ключ таблицы тегов. `satisfies` привязывает набор к
 * `BUILD_TAG_OF_OPTION`: опция, добавленная генератором, не соберётся без
 * своего детектора.
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
 * uTLS ездит в клиентских TLS-опциях и встречается в нескольких секциях —
 * аутбаунды, DNS-серверы, — поэтому ищется обходом всего документа: любой
 * узел с `tls.utls.enabled: true`.
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
 * Опции документа, которых нет в сборке бинаря. Читается как есть, теми же
 * правилами, что `findUnbuiltNodes`: `tags` — `null`, когда бинарь не
 * прочитан, и тогда список пуст, а не полон.
 */
export function findUnbuiltOptions(config: ConfigDocument | null, tags: readonly string[] | null): UnbuiltOption[] {
  if (config === null || tags === null) {
    return [];
  }

  const built = new Set(tags);
  const found: UnbuiltOption[] = [];

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ключи закрытого литерала: сужение до его union
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
