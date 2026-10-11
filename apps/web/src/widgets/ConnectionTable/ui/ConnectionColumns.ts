import {
  columnOrderingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  type AccessorFnColumnDef,
  type Column,
  type ColumnOrderState,
  type Table,
} from '@tanstack/react-table';
import type { ParseKeys } from 'i18next';

import type { ConnectionRow, ConnectionSourceLabel } from '@entities/Connection';

/**
 * Раскладка колонок. Ширины распределены по длине содержимого: правило
 * растягивается по остатку, остальное держит фиксированную ширину.
 */
export const CONNECTION_COLUMN = {
  Row: 'flex w-full items-center gap-3 border-b border-border px-3.5 text-sm',
  Source: 'w-28 shrink-0',
  Host: 'sticky left-0 z-10 w-52 shrink-0 bg-inherit',
  Network: 'w-16 shrink-0',
  Rule: 'min-w-0 grow',
  Action: 'w-40 shrink-0',
  Chain: 'w-36 shrink-0',
  Rate: 'w-28 shrink-0 text-right',
  Volume: 'w-24 shrink-0 text-right',
  Age: 'w-20 shrink-0 text-right',
  RowActions: 'w-14 shrink-0',
} as const;

export const CONNECTION_FIELD = {
  Source: 'source',
  Host: 'host',
  Network: 'network',
  Rule: 'rule',
  Action: 'action',
  Chain: 'chain',
  Rate: 'rate',
  Volume: 'volume',
  Age: 'age',
} as const;

export type ConnectionField = (typeof CONNECTION_FIELD)[keyof typeof CONNECTION_FIELD];

export interface ConnectionCellProps {
  connection: ConnectionRow;
  /** Момент отсчёта давности. Снаружи, иначе строка врала бы про свежесть. */
  now: number;
}

/** Видимая колонка в том виде, в каком её рисует строка. */
export interface ConnectionCell {
  id: ConnectionField;
  className: string;
  /** Подпись нужна списку «подпись — значение»: в таблице её несёт шапка. */
  label: ParseKeys<'widgets/ConnectionTable'>;
}

/**
 * Возможности таблицы объявляются поимённо: они опциональны, и в сборку
 * попадает только перечисленное здесь.
 */
export const CONNECTION_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text, basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
});

export type ConnectionTableFeatures = typeof CONNECTION_TABLE_FEATURES;

/** Подпись, класс раскладки и запрет на скрытие. */
export interface ConnectionColumnMeta {
  label: ParseKeys<'widgets/ConnectionTable'>;
  className: string;
  /**
   * Ширина колонки в `rem`, та же, что задаёт `className`. Класс читает
   * браузер, число — мы: по нему считается минимальная ширина таблицы, и без
   * него она была бы константой на полный набор колонок. Тогда скрытие колонок
   * не сужало бы таблицу, ради чего его и заводили.
   */
  width: number;
  /** Колонку нельзя скрыть: без неё строка перестаёт быть узнаваемой. */
  required: boolean;
}

/** Зазор между ячейками и боковые поля строки в `rem`: те же, что в `CONNECTION_COLUMN.Row`. */
const CELL_GAP = 0.75;
const ROW_PADDING = 1.75;

/** Ширина колонки действий строки и её минимум для растягивающейся колонки правила. */
const ROW_ACTIONS_WIDTH = 3.5;
const RULE_MIN_WIDTH = 10;

/**
 * Минимальная ширина таблицы под видимый набор колонок.
 *
 * Считается, а не берётся константой: одна ширина на все наборы означала бы,
 * что скрытие колонок не сужает таблицу. Значение одно на строку, липкую шапку
 * и контейнер строк — когда они расходятся, фон шапки обрывается на середине
 * прокрутки.
 */
export function toTableMinWidth(columns: readonly Pick<ConnectionTableColumn, 'def'>[]): string {
  const cells = columns.reduce((sum, { def }) => sum + def.meta.width, ROW_ACTIONS_WIDTH);
  const gaps = columns.length * CELL_GAP;

  return `${String(cells + gaps + ROW_PADDING)}rem`;
}

/**
 * Описание с сужённым идентификатором и обязательной `meta`. Библиотека держит
 * `id` строкой, а `meta` необязательной; у наших колонок гарантированы обе, и
 * шапка со строкой читают описание отсюда, а не через состояние таблицы, —
 * иначе появляются приведения типов.
 *
 * Тип акцессорной колонки, а не общий `ColumnDef`: тот union, и `accessorFn` в
 * нём необязателен. Все колонки этой таблицы считают значение функцией, и
 * колонка без неё должна быть ошибкой компиляции, а не тихо несортируемой.
 */
export type ConnectionColumnDef = AccessorFnColumnDef<ConnectionTableFeatures, ConnectionRow> & {
  id: ConnectionField;
  meta: ConnectionColumnMeta;
};

/**
 * Колонки таблицы соединений.
 *
 * Одна колонка — одно поле, один ключ сортировки, один отбор; отбор по полю —
 * фасет в тулбаре экрана, а не фильтр в шапке. Источник и хост разведены,
 * потому что это разные оси — кто начал и куда шло; правило, выход и
 * цепочка разведены, потому что это три звена причинной связи: почему совпало,
 * что решено, через что прошло. Составная ячейка осталась только там, где два
 * значения читаются как один факт и порознь не запрашиваются: входящее и
 * исходящее направление одной величины.
 *
 * Скорость и объём — тоже разные вопросы: «кто сейчас ест канал» и «кто больше
 * всего скачал», поэтому у них отдельные колонки и отдельные ключи сортировки.
 */
export const CONNECTION_COLUMNS: readonly ConnectionColumnDef[] = [
  {
    id: CONNECTION_FIELD.Source,
    // Подпись устройства подставляет `toLabeledColumns`: описание остаётся
    // данными, а список устройств приходит запросом.
    accessorFn: (row) => row.source,
    // Посимвольное сравнение ставит 192.168.1.120 перед 192.168.1.36: в адресе
    // числовые куски сравниваются как числа, а не как текст.
    sortFn: 'alphanumeric',
    meta: { label: 'column.source', className: CONNECTION_COLUMN.Source, width: 7, required: false },
  },
  {
    id: CONNECTION_FIELD.Host,
    accessorFn: (row) => row.host,
    sortFn: 'alphanumeric',
    meta: { label: 'column.host', className: CONNECTION_COLUMN.Host, width: 13, required: true },
  },
  {
    id: CONNECTION_FIELD.Network,
    accessorFn: (row) => row.network,
    sortFn: 'text',
    meta: { label: 'column.network', className: CONNECTION_COLUMN.Network, width: 4, required: false },
  },
  {
    id: CONNECTION_FIELD.Rule,
    accessorFn: (row) => row.rule,
    sortFn: 'text',
    meta: { label: 'column.rule', className: CONNECTION_COLUMN.Rule, width: RULE_MIN_WIDTH, required: false },
  },
  {
    id: CONNECTION_FIELD.Action,
    accessorFn: (row) => row.action,
    sortFn: 'text',
    meta: { label: 'column.action', className: CONNECTION_COLUMN.Action, width: 10, required: true },
  },
  {
    id: CONNECTION_FIELD.Chain,
    accessorFn: (row) => row.chain.join(' '),
    sortFn: 'text',
    meta: { label: 'column.chain', className: CONNECTION_COLUMN.Chain, width: 9, required: false },
  },
  {
    id: CONNECTION_FIELD.Rate,
    accessorFn: (row) => row.downRate + row.upRate,
    sortFn: 'basic',
    sortDescFirst: true,
    meta: { label: 'column.rate', className: CONNECTION_COLUMN.Rate, width: 7, required: false },
  },
  {
    id: CONNECTION_FIELD.Volume,
    accessorFn: (row) => row.download + row.upload,
    sortFn: 'basic',
    sortDescFirst: true,
    meta: { label: 'column.volume', className: CONNECTION_COLUMN.Volume, width: 6, required: false },
  },
  {
    id: CONNECTION_FIELD.Age,
    // Давность растёт, поэтому сравнивается момент начала: младшие — те, у кого он больше.
    accessorFn: (row) => row.startedAt,
    sortFn: 'basic',
    sortDescFirst: true,
    meta: { label: 'column.age', className: CONNECTION_COLUMN.Age, width: 5, required: false },
  },
];

/**
 * Колонки таблицы с подписью источника: сортировка идёт по имени устройства,
 * которое видно в ячейке, а не по адресу под ним. Безымянное устройство
 * подписано адресом, и порядок адресов остаётся числовым.
 */
export function toLabeledColumns(sourceLabel: ConnectionSourceLabel): readonly ConnectionColumnDef[] {
  return CONNECTION_COLUMNS.map((def) =>
    def.id === CONNECTION_FIELD.Source ? { ...def, accessorFn: (row: ConnectionRow) => sourceLabel(row.source) } : def
  );
}

/**
 * Колонки, скрытые при первом открытии.
 *
 * Сеть почти всегда `tcp` и вопрос решает редко; скорость перекрывается
 * объёмом, пока не ищут, кто прямо сейчас занимает канал. Обе включаются в один
 * клик, а ширина строки без них укладывается в ноутбучный экран без
 * горизонтальной прокрутки.
 */
export const CONNECTION_COLUMNS_HIDDEN: Readonly<Partial<Record<ConnectionField, boolean>>> = {
  [CONNECTION_FIELD.Network]: false,
  [CONNECTION_FIELD.Rate]: false,
};

/** Описание колонки вместе с её живым состоянием в таблице. */
export interface ConnectionTableColumn {
  def: ConnectionColumnDef;
  column: Column<ConnectionTableFeatures, ConnectionRow>;
}

/**
 * Описания колонок в порядке, который выбрал пользователь.
 *
 * Порядок хранится списком идентификаторов и переживает версии панели:
 * незнакомый идентификатор пропускается, а колонка, которой в списке нет, —
 * новая или из вида до перестановки — встаёт после упорядоченных в порядке
 * описаний. Пустой список — порядок описаний.
 */
export function toOrderedColumns(order: ColumnOrderState): ConnectionColumnDef[] {
  const position = new Map(order.map((id, index) => [id, index]));

  return CONNECTION_COLUMNS.map((def, index) => ({ def, rank: position.get(def.id) ?? order.length + index }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ def }) => def);
}

/**
 * Колонки таблицы в выбранном порядке.
 *
 * Обход идёт по собственным описаниям, а не по `getVisibleLeafColumns`: там
 * `id` — строка, а `meta` необязательна, здесь гарантированы обе. Отбор по
 * видимости вызывающий делает сам. Выбор полей обходится без модели таблицы и
 * читает вид напрямую через `toOrderedColumns`: тулбар у вкладок соединений
 * один, а модель у каждой своя.
 */
export function toTableColumns(
  table: Table<ConnectionTableFeatures, ConnectionRow>,
  order: ColumnOrderState
): ConnectionTableColumn[] {
  return toOrderedColumns(order).flatMap((def) => {
    const column = table.getColumn(def.id);

    return column === undefined ? [] : [{ def, column }];
  });
}
