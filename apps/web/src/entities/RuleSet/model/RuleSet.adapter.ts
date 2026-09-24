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

/** Набор без `type` ядро читает как удалённый. */
const DEFAULT_TYPE: RuleSetType = RULE_SET_TYPE.Remote;

const TYPES = new Set<string>(Object.values(RULE_SET_TYPE));

function toType(raw: unknown): RuleSetType {
  if (typeof raw === 'string' && TYPES.has(raw)) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- значение сверено с набором строкой выше
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
 * Где у набора лежит его источник: у удалённого это адрес, у локального —
 * путь на устройстве, у встроенного правила лежат в самом конфиге.
 */
function toLocation(node: object, type: RuleSetType): string {
  if (type === RULE_SET_TYPE.Local) {
    return toText(Reflect.get(node, 'path'));
  }

  return type === RULE_SET_TYPE.Remote ? toText(Reflect.get(node, 'url')) : '';
}

/**
 * Узел, через который ядро качает набор. Поле объявлено дважды: устаревшее
 * `download_detour` и `detour` внутри `http_client`, — панель читает оба,
 * потому что в чужом конфиге встречается любое.
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
 * Каталог демона в модель экрана. Список незнакомого вида пропускается, а не
 * гасит каталог: демон может оказаться новее панели.
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

/** Узел принят схемой форка: для него есть форма, а не только текстовый режим. */
export function isRuleSetRecognized(node: unknown): boolean {
  return RuleSetSchema.safeParse(node).success;
}

/**
 * Разворачивает `route.rule_set` в строки списка.
 *
 * Сколько правил ссылается на набор, считается снаружи и приходит картой: сам
 * слайс наборов о правилах не знает, а экрану это нужно одним проходом.
 */
export function toRuleSetRowsFromNodes(
  nodes: readonly unknown[],
  usage: ReadonlyMap<string, number>,
  catalog: RuleSetCatalog
): RuleSetRow[] {
  const rows: RuleSetRow[] = [];

  for (const [position, node] of nodes.entries()) {
    // Позиция берётся в исходном массиве: по ней правка адресует узел в файле,
    // и пропущенный не-объект сдвинул бы следующие правки на чужие узлы.
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
 * Сколько правил ссылается на каждый тег набора.
 *
 * Условие `rule_set` у правила — строка или список строк, и у логического
 * правила оно лежит во вложенных ветках: правило, сославшееся на набор изнутри
 * группы, ссылается на него не меньше прямого.
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

/** Теги наборов, на которые ссылается правило, без повторов внутри одного. */
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
