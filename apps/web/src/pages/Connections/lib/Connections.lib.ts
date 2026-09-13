import { useCallback, useMemo, useState } from 'react';

import {
  ConnectionState,
  filterConnections,
  toSourceGroups,
  type ConnectionRow,
  type ConnectionSource,
  type ConnectionSourceGroup,
} from '@entities/Connection';

export const CONNECTION_TAB = {
  Active: 'active',
  Closed: 'closed',
} as const;

export type ConnectionTab = (typeof CONNECTION_TAB)[keyof typeof CONNECTION_TAB];

export interface ConnectionsScreen {
  tab: ConnectionTab;
  setTab: (tab: ConnectionTab) => void;
  query: string;
  setQuery: (query: string) => void;
  source: ConnectionSource;
  setSource: (source: ConnectionSource) => void;
  /** Снимает и поиск, и устройство: кнопка на пустом экране обязана вернуть список. */
  reset: () => void;
  /** Устройства считаются по вкладке целиком, иначе фасет исчезал бы от своего же выбора. */
  sources: ConnectionSourceGroup[];
  rows: ConnectionRow[];
  total: number;
  filtered: boolean;
}

/**
 * Состояние экрана соединений: вкладка, поиск и выбранное устройство. Отбор
 * клиентский — снапшот уже целиком в панели, и ходить за отфильтрованным
 * списком на устройство значило бы показывать не то, что в сторе.
 */
export function useConnectionsScreen(): ConnectionsScreen {
  const [tab, setTab] = useState<ConnectionTab>(CONNECTION_TAB.Active);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<ConnectionSource>(null);

  const active = ConnectionState.use.active();
  const closed = ConnectionState.use.closed();
  // Источник переключает хук, а не разметка: обе вкладки рисуют один и тот же
  // `rows`, и правильный набор в них оказывается только отсюда.
  const all = tab === CONNECTION_TAB.Closed ? closed : active;

  const sources = useMemo(() => toSourceGroups(all), [all]);
  const rows = useMemo(() => filterConnections(all, query, source), [all, query, source]);

  const reset = useCallback(() => {
    setQuery('');
    setSource(null);
  }, []);

  return {
    tab,
    setTab,
    query,
    setQuery,
    source,
    setSource,
    reset,
    sources,
    rows,
    total: all.length,
    filtered: query.length > 0 || source !== null,
  };
}
