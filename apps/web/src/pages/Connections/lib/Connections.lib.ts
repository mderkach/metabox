import { useCallback, useMemo, useState } from 'react';

import {
  ConnectionState,
  filterConnections,
  toKindGroups,
  toSourceGroups,
  type ConnectionKind,
  type ConnectionKindGroup,
  type ConnectionRow,
  type ConnectionSource,
  type ConnectionSourceGroup,
} from '@entities/Connection';

import { useThrottledRows } from './Connections.throttle';

export const CONNECTION_TAB = {
  Active: 'active',
  Closed: 'closed',
} as const;

export type ConnectionTab = (typeof CONNECTION_TAB)[keyof typeof CONNECTION_TAB];

/** Набор одной вкладки: обе живут одновременно, поэтому у каждой он свой. */
export interface ConnectionTabRows {
  rows: ConnectionRow[];
  /** Сколько строк во вкладке до отбора: подвал сообщает обе величины. */
  total: number;
}

export interface ConnectionsScreen {
  tab: ConnectionTab;
  setTab: (tab: ConnectionTab) => void;
  query: string;
  setQuery: (query: string) => void;
  source: ConnectionSource;
  setSource: (source: ConnectionSource) => void;
  kind: ConnectionKind;
  setKind: (kind: ConnectionKind) => void;
  /** Снимает поиск и оба фасета: кнопка на пустом экране обязана вернуть список. */
  reset: () => void;
  /** Устройства считаются по вкладке целиком, иначе фасет исчезал бы от своего же выбора. */
  sources: ConnectionSourceGroup[];
  /** Судьбы пакета считаются по вкладке целиком — по той же причине, что и устройства. */
  kinds: ConnectionKindGroup[];
  active: ConnectionTabRows;
  closed: ConnectionTabRows;
  /** Сколько строк в показанной вкладке до отбора: число на чипе «Любое» в срезе устройств. */
  total: number;
  filtered: boolean;
}

function useTabRows(
  all: ConnectionRow[],
  query: string,
  source: ConnectionSource,
  kind: ConnectionKind
): ConnectionTabRows {
  const rows = useMemo(() => filterConnections(all, query, source, kind), [all, query, source, kind]);

  return { rows, total: all.length };
}

/**
 * Состояние экрана соединений: вкладка, поиск и срезы по устройству и действию. Отбор
 * клиентский — снапшот уже целиком в панели, и ходить за отфильтрованным
 * списком на устройство значило бы показывать не то, что в сторе.
 *
 * `interval` задаёт частоту обновления показанного набора: счётчики, фасеты и
 * подвал говорят про него же, а не про последний пришедший снапшот.
 */
export function useConnectionsScreen(interval: number): ConnectionsScreen {
  const [tab, setTab] = useState<ConnectionTab>(CONNECTION_TAB.Active);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<ConnectionSource>(null);
  const [kind, setKind] = useState<ConnectionKind>(null);

  // Дроссель стоит до отбора и свой у каждой вкладки: нажатие на фасет обязано
  // отозваться сразу, а переключение вкладки — показать её собственный набор, а
  // не набор соседней до конца периода.
  const liveRows = useThrottledRows(ConnectionState.use.active(), interval);
  const closedRows = useThrottledRows(ConnectionState.use.closed(), interval);
  // Отбор считается обеим вкладкам сразу: они обе смонтированы, и вкладка под
  // `Activity` обязана показать актуальный набор в тот же кадр, в котором
  // становится видимой.
  const active = useTabRows(liveRows, query, source, kind);
  const closed = useTabRows(closedRows, query, source, kind);

  // Фасеты и поиск общие, но считаются по показанной вкладке: иначе срез по
  // устройству называл бы числа соседней.
  const all = tab === CONNECTION_TAB.Closed ? closedRows : liveRows;

  const sources = useMemo(() => toSourceGroups(all), [all]);
  const kinds = useMemo(() => toKindGroups(all), [all]);

  const reset = useCallback(() => {
    setQuery('');
    setSource(null);
    setKind(null);
  }, []);

  return {
    tab,
    setTab,
    query,
    setQuery,
    source,
    setSource,
    kind,
    setKind,
    reset,
    sources,
    kinds,
    active,
    closed,
    total: all.length,
    filtered: query.length > 0 || source !== null || kind !== null,
  };
}
