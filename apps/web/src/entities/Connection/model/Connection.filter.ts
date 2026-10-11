import { z } from 'zod';

import { matchesWords, toQueryWords } from '@shared/lib/search';

import { ROUTE_KIND, type ConnectionRow, type RouteKind } from './Connection.model';

/** Какой набор соединений показан: живые или уже закрытые. */
export const CONNECTION_TAB = {
  Active: 'active',
  Closed: 'closed',
} as const;

export type ConnectionTab = (typeof CONNECTION_TAB)[keyof typeof CONNECTION_TAB];

/**
 * Фасет — срез списка по одному полю строки. Порядок записи — порядок кнопок в
 * тулбаре: от «чьё оно» и «куда ушло» к деталям маршрута.
 */
export const CONNECTION_FACET = {
  Source: 'source',
  Kind: 'kind',
  Rule: 'rule',
  Chain: 'chain',
  Network: 'network',
} as const;

export type ConnectionFacet = (typeof CONNECTION_FACET)[keyof typeof CONNECTION_FACET];

export const CONNECTION_FACETS: readonly ConnectionFacet[] = Object.values(CONNECTION_FACET);

/** Выбранные значения каждого фасета; пустой список — фасет не отбирает. */
export type ConnectionFacetSelection = Readonly<Record<ConnectionFacet, readonly string[]>>;

function toFacetRecord<T>(make: (facet: ConnectionFacet) => T): Record<ConnectionFacet, T> {
  return {
    [CONNECTION_FACET.Source]: make(CONNECTION_FACET.Source),
    [CONNECTION_FACET.Kind]: make(CONNECTION_FACET.Kind),
    [CONNECTION_FACET.Rule]: make(CONNECTION_FACET.Rule),
    [CONNECTION_FACET.Chain]: make(CONNECTION_FACET.Chain),
    [CONNECTION_FACET.Network]: make(CONNECTION_FACET.Network),
  };
}

export const EMPTY_FACET_SELECTION: ConnectionFacetSelection = toFacetRecord(() => []);

const ROUTE_KINDS = Object.values(ROUTE_KIND);

/**
 * Значение фасета в адресе: одно — строкой, несколько — списком. Строкой
 * остаются и старые ссылки `?source=<ip>&kind=proxy`: на них ведёт экран
 * устройств.
 */
const FacetParamSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const KindParamSchema = z.union([z.enum(ROUTE_KINDS), z.array(z.enum(ROUTE_KINDS)).min(1)]);
/**
 * Пустая строка — правило без условий, это настоящее значение фасета. В адресе
 * фасет правила называется `match`: `rule` занят номером правила экрана
 * маршрутизации, и общий для маршрутов `useSearch({ strict: false })` получил
 * бы у одного ключа два типа.
 */
const RuleParamSchema = z.union([z.string(), z.array(z.string()).min(1)]);

/**
 * Отбор в адресе: ссылка на отфильтрованный список — то, чем делятся, когда
 * спрашивают «почему сюда идёт трафик». Значения по умолчанию в адрес не
 * пишутся, поэтому чистый список открывается чистым адресом.
 */
export const ConnectionSearchSchema = z.object({
  tab: z.enum([CONNECTION_TAB.Active, CONNECTION_TAB.Closed]).optional(),
  q: z.string().min(1).optional(),
  source: FacetParamSchema.optional(),
  kind: KindParamSchema.optional(),
  match: RuleParamSchema.optional(),
  chain: FacetParamSchema.optional(),
  network: FacetParamSchema.optional(),
});

export type ConnectionSearch = z.infer<typeof ConnectionSearchSchema>;

export type ConnectionFacetSearch = Pick<ConnectionSearch, 'source' | 'kind' | 'match' | 'chain' | 'network'>;

/** Непонятое значение отбрасывается целиком: половина отбора хуже, чем его отсутствие. */
export function parseConnectionSearch(search: Record<string, unknown>): ConnectionSearch {
  const parsed = ConnectionSearchSchema.safeParse(search);

  return parsed.success ? parsed.data : {};
}

function toValues(param: string | readonly string[] | undefined): readonly string[] {
  if (param === undefined) {
    return [];
  }

  return typeof param === 'string' ? [param] : param;
}

/** Выбор фасетов из адреса. */
export function toFacetSelection(search: ConnectionFacetSearch): ConnectionFacetSelection {
  return {
    [CONNECTION_FACET.Source]: toValues(search.source),
    [CONNECTION_FACET.Kind]: toValues(search.kind),
    [CONNECTION_FACET.Rule]: toValues(search.match),
    [CONNECTION_FACET.Chain]: toValues(search.chain),
    [CONNECTION_FACET.Network]: toValues(search.network),
  };
}

function toParam<T extends string>(values: readonly T[]): T | T[] | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 ? values[0] : [...values];
}

const ROUTE_KIND_SET = new Set<string>(ROUTE_KINDS);

function isRouteKind(value: string): value is RouteKind {
  return ROUTE_KIND_SET.has(value);
}

/**
 * Выбор фасетов для адреса. Одно значение пишется строкой: ссылка на одно
 * устройство остаётся короткой — `?source=<ip>`, — и её можно набрать руками.
 */
export function toFacetSearch(selection: ConnectionFacetSelection): ConnectionFacetSearch {
  return {
    source: toParam(selection.source),
    kind: toParam(selection.kind.filter(isRouteKind)),
    match: toParam(selection.rule),
    chain: toParam(selection.chain),
    network: toParam(selection.network),
  };
}

export function hasFacetSelection(selection: ConnectionFacetSelection): boolean {
  return CONNECTION_FACETS.some((facet) => selection[facet].length > 0);
}

/** Значение фасета и число строк под ним. */
export interface ConnectionFacetValue {
  value: string;
  count: number;
}

export type ConnectionFacetValues = Readonly<Record<ConnectionFacet, readonly ConnectionFacetValue[]>>;

const KIND_RANK = new Map<string, number>(
  [ROUTE_KIND.Proxy, ROUTE_KIND.Direct, ROUTE_KIND.Block, ROUTE_KIND.Dns, ROUTE_KIND.Other].map((kind, rank) => [
    kind,
    rank,
  ])
);

/** Значения поля строки, по которым её отбирает фасет. Узел цепочки — каждый: группа и узел за ней. */
const FACET_FIELD: Readonly<Record<ConnectionFacet, (row: ConnectionRow) => string | readonly string[]>> = {
  [CONNECTION_FACET.Source]: (row) => row.source,
  [CONNECTION_FACET.Kind]: (row) => row.kind,
  [CONNECTION_FACET.Rule]: (row) => row.rule,
  [CONNECTION_FACET.Chain]: (row) => row.chain,
  [CONNECTION_FACET.Network]: (row) => row.network,
};

/** Подпись источника для поиска. Устройства знает их слайс, а не соединение, поэтому подпись приходит снаружи. */
export type ConnectionSourceLabel = (source: string) => string;

export interface ConnectionFilterResult {
  rows: ConnectionRow[];
  facets: ConnectionFacetValues;
}

/** Числовые куски сравниваются как числа: 192.168.1.36 стоит перед 192.168.1.120. */
const NATURAL_ORDER = new Intl.Collator(undefined, { numeric: true });

/**
 * Значения фасета в порядке, который не зависит от счётчиков: они меняются
 * каждую секунду, и значения переставлялись бы под курсором. Действия идут
 * заданным списком, устройства — по подписи, остальное — по значению.
 */
function toFacetValues(
  counts: Map<string, number>,
  facet: ConnectionFacet,
  sourceLabel: ConnectionSourceLabel | null
): ConnectionFacetValue[] {
  const values = [...counts].map(([value, count]) => ({ value, count }));

  if (facet === CONNECTION_FACET.Kind) {
    return values.sort((left, right) => (KIND_RANK.get(left.value) ?? 0) - (KIND_RANK.get(right.value) ?? 0));
  }

  if (facet === CONNECTION_FACET.Source && sourceLabel !== null) {
    return values.sort(
      (left, right) =>
        sourceTier(left.value, sourceLabel) - sourceTier(right.value, sourceLabel) ||
        NATURAL_ORDER.compare(sourceLabel(left.value), sourceLabel(right.value))
    );
  }

  return values.sort((left, right) => NATURAL_ORDER.compare(left.value, right.value));
}

const PRIVATE_IPV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

const SOURCE_TIER = { Named: 0, Local: 1, Foreign: 2 } as const;

/**
 * Устройства с именем идут первыми, за ними безымянные адреса локальной сети,
 * в конце чужие адреса: их соединения пришли снаружи, и искать их в списке
 * устройств приходится реже всего.
 */
function sourceTier(source: string, sourceLabel: ConnectionSourceLabel): number {
  if (sourceLabel(source) !== source) {
    return SOURCE_TIER.Named;
  }

  return PRIVATE_IPV4.test(source) ? SOURCE_TIER.Local : SOURCE_TIER.Foreign;
}

/**
 * Отбор соединений и счётчики фасетов одним проходом.
 *
 * Значения фасета — все, что есть во вкладке, и выбранные, даже если строк под
 * ними сейчас нет: фасет не теряет значение от собственного выбора и от
 * соседнего. Счётчик значения считается с поиском и остальными фасетами, но
 * без своего: он отвечает, сколько строк добавит выбор значения, а не сколько
 * их во вкладке вообще. Строка, которая не проходит ровно один фасет, поэтому
 * считается только в нём.
 *
 * Внутри фасета значения складываются через «или», фасеты между собой — через
 * «и».
 *
 * `sourceLabel` дополняет индекс поиска подписью устройства: соединение
 * находится по имени, хотя в строке поиска лежит адрес. Подпись считается раз
 * на источник, а не на строку: устройств единицы, строк — тысячи. Ею же
 * упорядочены устройства в фасете.
 */
export function filterConnections(
  rows: ConnectionRow[],
  query: string,
  selection: ConnectionFacetSelection = EMPTY_FACET_SELECTION,
  sourceLabel: ConnectionSourceLabel | null = null
): ConnectionFilterResult {
  const words = toQueryWords(query);
  const labels = new Map<string, string>();

  function labelText(value: string): string {
    let text = labels.get(value);

    if (text === undefined) {
      text = sourceLabel === null ? '' : sourceLabel(value).toLowerCase();
      labels.set(value, text);
    }

    return text;
  }

  function matchesQuery(row: ConnectionRow): boolean {
    return (
      matchesWords(row.searchText, words) ||
      (sourceLabel !== null &&
        words.every((word) => row.searchText.includes(word) || labelText(row.source).includes(word)))
    );
  }

  const active = CONNECTION_FACETS.filter((facet) => selection[facet].length > 0).map((facet) => ({
    facet,
    selected: new Set(selection[facet]),
  }));
  const counts = toFacetRecord(() => new Map<string, number>());
  const shown: ConnectionRow[] = [];

  function addValues(facet: ConnectionFacet, row: ConnectionRow, step: number) {
    const facetCounts = counts[facet];
    const field = FACET_FIELD[facet](row);

    if (typeof field === 'string') {
      facetCounts.set(field, (facetCounts.get(field) ?? 0) + step);

      return;
    }

    for (const value of field) {
      facetCounts.set(value, (facetCounts.get(value) ?? 0) + step);
    }
  }

  for (const row of rows) {
    let failed: ConnectionFacet | null = null;
    let failures = 0;

    for (const { facet, selected } of active) {
      const field = FACET_FIELD[facet](row);
      const matched = typeof field === 'string' ? selected.has(field) : field.some((value) => selected.has(value));

      if (!matched) {
        failures += 1;
        failed = facet;
      }
    }

    const counted = failures <= 1 && matchesQuery(row);

    for (const facet of CONNECTION_FACETS) {
      addValues(facet, row, counted && (failures === 0 || facet === failed) ? 1 : 0);
    }

    if (counted && failures === 0) {
      shown.push(row);
    }
  }

  for (const { facet, selected } of active) {
    for (const value of selected) {
      if (!counts[facet].has(value)) {
        counts[facet].set(value, 0);
      }
    }
  }

  return { rows: shown, facets: toFacetRecord((facet) => toFacetValues(counts[facet], facet, sourceLabel)) };
}
