import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

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
  type ConnectionSourceLabel,
  type ConnectionSearch,
  type ConnectionTab,
} from '@entities/Connection';
import { deviceLabel, useDeviceIndex } from '@entities/Device';

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
  source: ConnectionSource;
  setSource: (source: ConnectionSource) => void;
  kind: ConnectionKind;
  setKind: (kind: ConnectionKind) => void;
  /** Снимает поиск и оба фасета: кнопка на пустом экране обязана вернуть список. */
  reset: () => void;
  /** Устройства считаются по вкладке целиком, иначе фасет исчезал бы от своего же выбора. */
  sources: ConnectionSourceGroup[];
  /** Подпись устройства по адресу: фасет хранит адрес, а показывает её. */
  sourceLabel: ConnectionSourceLabel;
  /** Судьбы пакета считаются по вкладке целиком — по той же причине, что и устройства. */
  kinds: ConnectionKindGroup[];
  active: ConnectionTabRows;
  closed: ConnectionTabRows;
  counts: ConnectionTabCounts;
  /** Сколько строк в показанной вкладке до отбора: число на чипе «Любое» в срезе устройств. */
  total: number;
  filtered: boolean;
}

function useTabRows(
  all: ConnectionRow[],
  query: string,
  source: ConnectionSource,
  kind: ConnectionKind,
  sourceLabel: ConnectionSourceLabel
): ConnectionTabRows {
  const rows = useMemo(
    () => filterConnections(all, query, source, kind, sourceLabel),
    [all, query, source, kind, sourceLabel]
  );

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
  // Скрытая вкладка получает набор, замороженный на момент, когда её спрятали:
  // отбор по нему не пересчитывается на каждый снапшот, а тело таблицы не
  // перерисовывается. Показанная получает текущий набор в тот же кадр, в
  // котором становится видимой.
  const active = useTabRows(useWhileVisible(liveRows, tab === CONNECTION_TAB.Active), query, source, kind, sourceLabel);
  const closed = useTabRows(
    useWhileVisible(closedRows, tab === CONNECTION_TAB.Closed),
    query,
    source,
    kind,
    sourceLabel
  );
  const counts = { [CONNECTION_TAB.Active]: liveRows.length, [CONNECTION_TAB.Closed]: closedRows.length };

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
    sourceLabel,
    kinds,
    active,
    closed,
    counts,
    total: all.length,
    filtered: query.length > 0 || source !== null || kind !== null,
  };
}
