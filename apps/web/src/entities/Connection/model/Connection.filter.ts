import { countGroups } from '@shared/lib/group';
import { matchesWords, toQueryWords } from '@shared/lib/search';

import type { ConnectionRow } from './Connection.model';

/** Источник, по которому отбираются соединения; `null` — все сразу. */
export type ConnectionSource = string | null;

export interface ConnectionSourceGroup {
  source: string;
  count: number;
}

/**
 * Устройства в порядке убывания числа соединений. Источник — это хост в
 * локальной сети, и на роутере их единицы: список фасетов не разрастается.
 */
export function toSourceGroups(rows: ConnectionRow[]): ConnectionSourceGroup[] {
  return countGroups(rows, (row) => row.source).map((group) => ({ source: group.value, count: group.count }));
}

export function filterConnections(rows: ConnectionRow[], query: string, source: ConnectionSource): ConnectionRow[] {
  const words = toQueryWords(query);

  return rows.filter((row) => (source === null || row.source === source) && matchesWords(row.searchText, words));
}
