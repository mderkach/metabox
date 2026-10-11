import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

import {
  CONNECTION_FACET,
  CONNECTION_FACETS,
  CONNECTION_TAB,
  ConnectionState,
  EMPTY_FACET_SELECTION,
  filterConnections,
  hasFacetSelection,
  toFacetSearch,
  toFacetSelection,
  type ConnectionFacet,
  type ConnectionFacetSelection,
  type ConnectionFacetValues,
  type ConnectionFilterResult,
  type ConnectionRow,
  type ConnectionSourceLabel,
  type ConnectionSearch,
  type ConnectionTab,
} from '@entities/Connection';
import { deviceLabel, useDeviceIndex } from '@entities/Device';
import { CONNECTION_FIELD, type ConnectionField } from '@widgets/ConnectionTable';

import { useThrottledRows } from './Connections.throttle';

/**
 * Набор одной вкладки: обе живут одновременно, поэтому у каждой он свой. У
 * скрытой вкладки он заморожен — см. `useWhileVisible`.
 */
export interface ConnectionTabRows {
  rows: ConnectionRow[];
  /** Сколько строк во вкладке до отбора: подвал сообщает обе величины. */
  total: number;
}

/** Живые счётчики вкладок: число на ярлыке не ждёт, пока вкладку откроют. */
export type ConnectionTabCounts = Readonly<Record<ConnectionTab, number>>;

interface VisibleValue<T> {
  visible: boolean;
  value: T;
}

/**
 * Значение, которое скрытая вкладка видит замороженным: пока она спрятана, хук
 * отдаёт то, что было в момент, когда её спрятали, а показанная получает
 * текущее в тот же кадр, в котором становится видимой.
 *
 * Скрытая вкладка стоит под `Activity` и перерисовывается пониженным
 * приоритетом на каждый новый пропс. Новый снапшот раз в секунду — новый
 * пропс, и вкладку, которую никто не видит, отбирали бы и рисовали заново на
 * каждый тик.
 *
 * Состояние меняется только на смене видимости, а не на каждом значении: иначе
 * каждый тик стоил бы лишнего прохода по экрану.
 */
export function useWhileVisible<T>(value: T, visible: boolean): T {
  const [frozen, setFrozen] = useState<VisibleValue<T>>({ visible, value });

  if (frozen.visible !== visible) {
    setFrozen({ visible, value });
  }

  return visible ? value : frozen.value;
}

export interface ConnectionsScreen {
  tab: ConnectionTab;
  setTab: (tab: ConnectionTab) => void;
  query: string;
  setQuery: (query: string) => void;
  selection: ConnectionFacetSelection;
  setFacet: (facet: ConnectionFacet, values: readonly string[]) => void;
  /** Снимает все фасеты, а поиск оставляет: его набирали руками и видят в поле. */
  resetFacets: () => void;
  /** Снимает поиск и фасеты: кнопка на пустом экране обязана вернуть список. */
  reset: () => void;
  /** Значения и счётчики фасетов показанной вкладки — правила подсчёта у `filterConnections`. */
  facets: ConnectionFacetValues;
  /** Подпись устройства по адресу: фасет хранит адрес, а показывает её. */
  sourceLabel: ConnectionSourceLabel;
  /** Колонки, по полю которых стоит фасет: шапка таблицы несёт признак отбора. */
  filteredColumns: ReadonlySet<ConnectionField>;
  active: ConnectionTabRows;
  closed: ConnectionTabRows;
  counts: ConnectionTabCounts;
  filtered: boolean;
}

/** Колонка таблицы, которая показывает поле фасета. Действие красится по судьбе пакета. */
const FACET_COLUMN: Readonly<Record<ConnectionFacet, ConnectionField>> = {
  [CONNECTION_FACET.Source]: CONNECTION_FIELD.Source,
  [CONNECTION_FACET.Kind]: CONNECTION_FIELD.Action,
  [CONNECTION_FACET.Rule]: CONNECTION_FIELD.Rule,
  [CONNECTION_FACET.Chain]: CONNECTION_FIELD.Chain,
  [CONNECTION_FACET.Network]: CONNECTION_FIELD.Network,
};

function useTabFilter(
  all: ConnectionRow[],
  query: string,
  selection: ConnectionFacetSelection,
  sourceLabel: ConnectionSourceLabel
): ConnectionFilterResult {
  return useMemo(() => filterConnections(all, query, selection, sourceLabel), [all, query, selection, sourceLabel]);
}

/**
 * Состояние экрана соединений: вкладка, поиск и фасеты. Отбор
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
  // Адрес отдаёт значения со структурным разделением: ссылки стоят, пока
  // значение не изменилось, и выбор не пересчитывает отбор на каждый рендер.
  const { source, kind, match, chain, network } = search;
  const selection = useMemo(
    () => toFacetSelection({ source, kind, match, chain, network }),
    [source, kind, match, chain, network]
  );

  // Экран соединений — единственный, кто опрашивает список устройств, пока
  // открыт: ячейки и объяснение маршрута читают тот же кэш без своего таймера.
  const devices = useDeviceIndex({ poll: true });
  const sourceLabel = useCallback((ip: string) => deviceLabel(ip, devices), [devices]);

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

  const setFacet = useCallback(
    (facet: ConnectionFacet, values: readonly string[]) => {
      patchSearch(toFacetSearch({ ...selection, [facet]: values }));
    },
    [patchSearch, selection]
  );

  const resetFacets = useCallback(() => {
    patchSearch(toFacetSearch(EMPTY_FACET_SELECTION));
  }, [patchSearch]);

  // Дроссель стоит до отбора и свой у каждой вкладки: нажатие на фасет обязано
  // отозваться сразу, а переключение вкладки — показать её собственный набор, а
  // не набор соседней до конца периода.
  const liveRows = useThrottledRows(ConnectionState.use.active(), interval);
  const closedRows = useThrottledRows(ConnectionState.use.closed(), interval);
  // Скрытая вкладка получает набор, замороженный на момент, когда её спрятали:
  // отбор по нему не пересчитывается на каждый снапшот, а тело таблицы не
  // перерисовывается. Показанная получает текущий набор в тот же кадр, в
  // котором становится видимой.
  const liveShown = useWhileVisible(liveRows, tab === CONNECTION_TAB.Active);
  const closedShown = useWhileVisible(closedRows, tab === CONNECTION_TAB.Closed);
  const activeFilter = useTabFilter(liveShown, query, selection, sourceLabel);
  const closedFilter = useTabFilter(closedShown, query, selection, sourceLabel);
  const counts = { [CONNECTION_TAB.Active]: liveRows.length, [CONNECTION_TAB.Closed]: closedRows.length };

  const reset = useCallback(() => {
    patchSearch({ q: undefined, ...toFacetSearch(EMPTY_FACET_SELECTION) });
  }, [patchSearch]);

  const filteredColumns = useMemo(
    () => new Set(CONNECTION_FACETS.filter((facet) => selection[facet].length > 0).map((facet) => FACET_COLUMN[facet])),
    [selection]
  );

  return {
    tab,
    setTab,
    query,
    setQuery,
    selection,
    setFacet,
    resetFacets,
    reset,
    // Фасеты и поиск общие, но считаются по показанной вкладке: иначе срез по
    // устройству называл бы числа соседней.
    facets: tab === CONNECTION_TAB.Closed ? closedFilter.facets : activeFilter.facets,
    sourceLabel,
    filteredColumns,
    active: { rows: activeFilter.rows, total: liveShown.length },
    closed: { rows: closedFilter.rows, total: closedShown.length },
    counts,
    filtered: query.length > 0 || hasFacetSelection(selection),
  };
}
