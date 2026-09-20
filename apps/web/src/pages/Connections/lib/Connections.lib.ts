import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import {
  CONNECTION_TAB,
  ConnectionState,
  filterConnections,
  toKindGroups,
  toSourceGroups,
  type ConnectionKind,
  type ConnectionKindGroup,
  type ConnectionRow,
  type ConnectionSource,
  type ConnectionSourceGroup,
  type ConnectionSearch,
  type ConnectionTab,
} from '@entities/Connection';

import { useThrottledRows } from './Connections.throttle';

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
  const search = useSearch({ from: '/connections' });
  const navigate = useNavigate({ from: '/connections' });

  const tab = search.tab ?? CONNECTION_TAB.Active;
  const query = search.q ?? '';
  const source = search.source ?? null;
  const kind = search.kind ?? null;

  // Отбор заменяет адрес, а не добавляет запись в историю: иначе «назад» после
  // набранного запроса откручивало бы его по букве. Пустое значение из адреса
  // убирается, а не остаётся хвостом `?q=`.
  const patchSearch = useCallback(
    (patch: Partial<ConnectionSearch>) => {
      void navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );

  const setTab = useCallback(
    (next: ConnectionTab) => {
      patchSearch({ tab: next === CONNECTION_TAB.Active ? undefined : next });
    },
    [patchSearch]
  );

  const setQuery = useCallback(
    (next: string) => {
      patchSearch({ q: next === '' ? undefined : next });
    },
    [patchSearch]
  );

  const setSource = useCallback(
    (next: ConnectionSource) => {
      patchSearch({ source: next ?? undefined });
    },
    [patchSearch]
  );

  const setKind = useCallback(
    (next: ConnectionKind) => {
      patchSearch({ kind: next ?? undefined });
    },
    [patchSearch]
  );

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
    patchSearch({ q: undefined, source: undefined, kind: undefined });
  }, [patchSearch]);

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
