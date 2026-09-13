export interface ConnectionRow {
  id: string;
  /** Хост с портом; когда sniff не разобрал имя, остаётся адрес. */
  host: string;
  network: string;
  source: string;
  /** Условия сработавшего правила: у безусловного правила пусто. */
  rule: string;
  /** Исход правила: `route(proxy)`, `hijack-dns`, `sniff`. */
  outcome: string;
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

/** Русское числительное для счёта соединений: экран и панели считают их вслух. */
export const CONNECTION_FORMS = ['соединение', 'соединения', 'соединений'] as const;

/** Исход соединения, не совпавшего ни с одним правилом: узел `route.final`. */
export const FINAL_OUTCOME = 'route.final';

/**
 * Судьба пакета. Рантайм отдаёт исход строкой (`route(direct)`, `hijack-dns`,
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
const OUTCOME_KINDS: readonly { match: string; kind: RouteKind }[] = [
  { match: 'direct', kind: ROUTE_KIND.Direct },
  { match: 'block', kind: ROUTE_KIND.Block },
  { match: 'reject', kind: ROUTE_KIND.Block },
  { match: 'dns', kind: ROUTE_KIND.Dns },
  { match: 'route(', kind: ROUTE_KIND.Proxy },
];

/** Узел цепочки, означающий выход наружу без прокси. */
const DIRECT_NODE = 'direct';

/**
 * Исход соединения. У `route.final` условий нет и по строке исход не читается —
 * там судьбу показывает цепочка: она наблюдаема так же, как правило (ADR-0007).
 */
export function toRouteKind(outcome: string, chain: readonly string[] = []): RouteKind {
  const lower = outcome.toLowerCase();
  const matched = OUTCOME_KINDS.find((entry) => lower.includes(entry.match));

  if (matched !== undefined) {
    return matched.kind;
  }

  if (outcome !== FINAL_OUTCOME || chain.length === 0) {
    return ROUTE_KIND.Other;
  }

  return chain.includes(DIRECT_NODE) ? ROUTE_KIND.Direct : ROUTE_KIND.Proxy;
}

/** Доля сводки: сколько соединений и сколько канала на них приходится. */
export interface ConnectionShare<Key extends string = string> {
  /** Ключ группы — исход, тип сети, узел цепочки или адрес устройства. */
  key: Key;
  count: number;
  /** Байт в секунду, входящий и исходящий вместе. */
  rate: number;
}

/** Сводка живого снапшота: то, что панели показывают вместо списка. */
export interface ConnectionSummary {
  outcomes: ConnectionShare<RouteKind>[];
  networks: ConnectionShare[];
  /** Конечные узлы цепочки, самые быстрые первыми. */
  nodes: ConnectionShare[];
  /** Устройства локальной сети, самые быстрые первыми. */
  sources: ConnectionShare[];
}

export const EMPTY_SUMMARY: ConnectionSummary = { outcomes: [], networks: [], nodes: [], sources: [] };

/** Сколько групп показывает столбчатая сводка: дальше идёт хвост из единиц. */
export const TOP_LIMIT = 5;

/** Сколько закрытых соединений держим: список закрытых Clash API не отдаёт. */
export const CLOSED_LIMIT = 200;
