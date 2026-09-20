import { z } from 'zod';

import { countGroups } from '@shared/lib/group';
import { matchesWords, toQueryWords } from '@shared/lib/search';

import { ROUTE_KIND, type ConnectionRow, type RouteKind } from './Connection.model';

/** Какой набор соединений показан: живые или уже закрытые. */
export const CONNECTION_TAB = {
  Active: 'active',
  Closed: 'closed',
} as const;

export type ConnectionTab = (typeof CONNECTION_TAB)[keyof typeof CONNECTION_TAB];

/** Источник, по которому отбираются соединения; `null` — все сразу. */
export type ConnectionSource = string | null;

/** Судьба пакета, по которой отбираются соединения; `null` — все сразу. */
export type ConnectionKind = RouteKind | null;

/**
 * Отбор в адресе: ссылка на отфильтрованный список — то, чем делятся, когда
 * спрашивают «почему сюда идёт трафик». Значения по умолчанию в адрес не
 * пишутся, поэтому чистый список открывается чистым адресом.
 */
export const ConnectionSearchSchema = z.object({
  tab: z.enum([CONNECTION_TAB.Active, CONNECTION_TAB.Closed]).optional(),
  q: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  kind: z.enum(Object.values(ROUTE_KIND)).optional(),
});

export type ConnectionSearch = z.infer<typeof ConnectionSearchSchema>;

/** Непонятое значение отбрасывается целиком: половина отбора хуже, чем его отсутствие. */
export function parseConnectionSearch(search: Record<string, unknown>): ConnectionSearch {
  const parsed = ConnectionSearchSchema.safeParse(search);

  return parsed.success ? parsed.data : {};
}

export interface ConnectionSourceGroup {
  source: string;
  count: number;
}

export interface ConnectionKindGroup {
  kind: RouteKind;
  count: number;
}

/**
 * Порядок чипов фасета по действию. Задан списком, а не числом соединений:
 * счётчики меняются каждую секунду, и чипы переставлялись бы под курсором.
 */
const KIND_ORDER: readonly RouteKind[] = [
  ROUTE_KIND.Proxy,
  ROUTE_KIND.Direct,
  ROUTE_KIND.Block,
  ROUTE_KIND.Dns,
  ROUTE_KIND.Other,
];

/**
 * Устройства в порядке убывания числа соединений. Источник — это хост в
 * локальной сети, и на роутере их единицы: список фасетов не разрастается.
 */
export function toSourceGroups(rows: ConnectionRow[]): ConnectionSourceGroup[] {
  return countGroups(rows, (row) => row.source).map((group) => ({ source: group.value, count: group.count }));
}

/** Судьбы пакета в неизменном порядке; пустые группы не показываются. */
export function toKindGroups(rows: ConnectionRow[]): ConnectionKindGroup[] {
  const counts = new Map<RouteKind, number>();

  for (const row of rows) {
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }

  return KIND_ORDER.flatMap((kind) => {
    const count = counts.get(kind);

    return count === undefined ? [] : [{ kind, count }];
  });
}

export function filterConnections(
  rows: ConnectionRow[],
  query: string,
  source: ConnectionSource,
  kind: ConnectionKind = null
): ConnectionRow[] {
  const words = toQueryWords(query);

  return rows.filter(
    (row) =>
      (source === null || row.source === source) &&
      (kind === null || row.kind === kind) &&
      matchesWords(row.searchText, words)
  );
}
