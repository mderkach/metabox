export interface ConnectionRow {
  id: string;
  /** Хост с портом; когда sniff не разобрал имя, остаётся адрес. */
  host: string;
  network: string;
  source: string;
  /** Условия сработавшего правила: у безусловного правила пусто. */
  rule: string;
  /** Действие правила, словом sing-box: `route(proxy)`, `hijack-dns`, `sniff`. */
  action: string;
  /** Судьба пакета, разобранная из действия и цепочки: по ней отбирают и красят строку. */
  kind: RouteKind;
  /** Цепочка в порядке чтения человеком: группа → узел. */
  chain: string[];
  upload: number;
  download: number;
  /**
   * Скорость за последний интервал снапшотов, байт в секунду. Считает панель:
   * рантайм отдаёт только накопленные счётчики, а вопрос «кто сейчас ест канал»
   * по ним не отвечается.
   */
  downRate: number;
  upRate: number;
  startedAt: number;
  /** Хост, источник, правило, исход и цепочка одной строкой — по ней ищет экран. */
  searchText: string;
}

/** Байт в секунду за интервал между двумя снапшотами. */
export interface ConnectionRate {
  down: number;
  up: number;
}

export interface ConnectionTotals {
  upload: number;
  download: number;
  memory: number;
}

/** Действие для соединения, не совпавшего ни с одним правилом: узел `route.final`. */
export const FINAL_ACTION = 'route.final';

/**
 * Судьба пакета. Рантайм отдаёт действие строкой (`route(direct)`, `hijack-dns`,
 * `sniff`), и новый вид узла добавляется записью в таблицу ниже, а не веткой
 * условия.
 */
export const ROUTE_KIND = {
  Direct: 'direct',
  Proxy: 'proxy',
  Block: 'block',
  Dns: 'dns',
  Other: 'other',
} as const;

export type RouteKind = (typeof ROUTE_KIND)[keyof typeof ROUTE_KIND];

/** Порядок значим: проверка идёт до первого совпадения, `block` стоит раньше общего `route(`. */
const ACTION_KINDS: readonly { match: string; kind: RouteKind }[] = [
  { match: 'direct', kind: ROUTE_KIND.Direct },
  { match: 'block', kind: ROUTE_KIND.Block },
  { match: 'reject', kind: ROUTE_KIND.Block },
  { match: 'dns', kind: ROUTE_KIND.Dns },
  { match: 'route(', kind: ROUTE_KIND.Proxy },
];

/** Узел цепочки, означающий выход наружу без прокси. */
const DIRECT_NODE = 'direct';

/**
 * Типы аутбаундов, у которых тон свой. Остальные — селекторы, замеры задержки и
 * все протоколы прокси из `OutboundSchema` (`@shared/api/generated`) — выводят
 * трафик через узел, поэтому незнакомый тип получает тон прокси, а списка
 * протоколов здесь нет: копия разъехалась бы со схемой форка.
 *
 * `block` и `dns` форк аутбаундами больше не принимает — их место заняли
 * действия правил, — но в конфиге с устройства они встречаются, и карта типов
 * собирается по узлам документа, а не по схеме.
 */
const OUTBOUND_TYPE_KIND: Readonly<Record<string, RouteKind>> = {
  direct: ROUTE_KIND.Direct,
  block: ROUTE_KIND.Block,
  dns: ROUTE_KIND.Dns,
};

/** Действие маршрута с тегом аутбаунда: `route(proxy)`, но не `route-options(...)`. */
const ROUTE_ACTION = /^route\((.+)\)$/;

/** Карта типов ещё не пришла: разбор обходится таблицей подстрок. */
export const EMPTY_OUTBOUND_TYPES: ReadonlyMap<string, string> = new Map();

/** Тон по типу узла; `null` — тега в конфиге нет, тип неизвестен. */
function toTypeKind(tag: string | undefined, outboundTypes: ReadonlyMap<string, string>): RouteKind | null {
  if (tag === undefined) {
    return null;
  }

  const type = outboundTypes.get(tag);

  return type === undefined ? null : (OUTBOUND_TYPE_KIND[type] ?? ROUTE_KIND.Proxy);
}

/**
 * Действие соединения.
 *
 * Первичен тип аутбаунда: тег из `route(<тег>)` или из цепочки ищется в
 * `outboundTypes`, и `direct-ru` типа `vless` получает тон прокси. Запасной
 * вариант — таблица подстрок по самой строке действия: узла из подписки
 * поставщика в `outbounds` нет, и типа у панели для него не будет (ADR-0013).
 *
 * У `route.final` условий нет и по строке действие не читается — там судьбу
 * показывает цепочка: она наблюдаема так же, как правило (ADR-0007).
 */
export function toRouteKind(
  action: string,
  chain: readonly string[] = [],
  outboundTypes: ReadonlyMap<string, string> = EMPTY_OUTBOUND_TYPES
): RouteKind {
  const typed = toTypeKind(ROUTE_ACTION.exec(action)?.[1], outboundTypes);

  if (typed !== null) {
    return typed;
  }

  // Цепочка читается от группы к узлу: группа объявлена в конфиге, а конечный
  // узел часто приходит из подписки, которой в документе нет.
  if (action === FINAL_ACTION) {
    for (const node of chain) {
      const kind = toTypeKind(node, outboundTypes);

      if (kind !== null) {
        return kind;
      }
    }
  }

  const lower = action.toLowerCase();
  const matched = ACTION_KINDS.find((entry) => lower.includes(entry.match));

  if (matched !== undefined) {
    return matched.kind;
  }

  if (action !== FINAL_ACTION || chain.length === 0) {
    return ROUTE_KIND.Other;
  }

  return chain.includes(DIRECT_NODE) ? ROUTE_KIND.Direct : ROUTE_KIND.Proxy;
}

/** Доля сводки: сколько соединений и сколько канала на них приходится. */
export interface ConnectionShare<Key extends string = string> {
  /** Ключ группы — действие, тип сети, узел цепочки или адрес устройства. */
  key: Key;
  count: number;
  /** Байт в секунду, входящий и исходящий вместе. */
  rate: number;
  /** Накопленные байты группы, входящие и исходящие вместе. */
  volume: number;
}

/** Сводка живого снапшота: то, что панели показывают вместо списка. */
export interface ConnectionSummary {
  actions: ConnectionShare<RouteKind>[];
  networks: ConnectionShare[];
  /** Конечные узлы цепочки, самые быстрые первыми. */
  nodes: ConnectionShare[];
  /** Устройства локальной сети, самые быстрые первыми. */
  sources: ConnectionShare[];
}

export const EMPTY_SUMMARY: ConnectionSummary = { actions: [], networks: [], nodes: [], sources: [] };

/** Сколько групп показывает столбчатая сводка: дальше идёт хвост из единиц. */
export const TOP_LIMIT = 5;

/** Сколько закрытых соединений держим: список закрытых Clash API не отдаёт. */
export const CLOSED_LIMIT = 200;
