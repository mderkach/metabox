import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useRef } from 'react';

import { useCloseConnection, type ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { cn } from '@shared/lib/utils';

import { CONNECTION_COLUMN } from './ConnectionColumns';
import { ConnectionRow } from './ConnectionRow';

/** Оценка для первого кадра: точную высоту виртуализатор измеряет сам. */
const ROW_ESTIMATE = 52;
const OVERSCAN = 10;

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/**
 * Список соединений.
 *
 * Колонки заданы фиксированной шириной и на узком экране не сжимаются: адрес,
 * правило и цепочка обрезались бы до неразличимости. Вместо этого таблица
 * прокручивается по горизонтали целиком — вместе с шапкой.
 *
 * Виртуализован не ради красоты: на устройстве бывают тысячи живых соединений
 * (NFR-2), и полный список в DOM держал бы главный поток занятым на каждом
 * снапшоте. Из-за виртуализации таблица собрана ролями, а не тегом `table`:
 * строки лежат абсолютно позиционированными, а `display` поверх табличных
 * тегов ломает их разбор вспомогательными технологиями сильнее, чем помогает.
 * Роли и `aria-rowcount` описывают полный список, а не отрисованное окно.
 */
export function ConnectionTable({ rows, closable }: { rows: ConnectionRowModel[]; closable: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = useCloseConnection();

  const onClose = useCallback(
    (id: string) => {
      close.mutate(id);
    },
    [close]
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
  });

  if (rows.length === 0) {
    return (
      <p className='rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground'>
        Соединений нет. Поток идёт: строки появятся, как только трафик пойдёт через sing-box.
      </p>
    );
  }

  return (
    <div
      role='table'
      aria-label='Соединения'
      aria-rowcount={rows.length + HEADER_ROWS}
      className='flex min-h-0 grow flex-col overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10'
    >
      <div role='rowgroup' className='shrink-0'>
        <div role='row' aria-rowindex={1} className={cn(CONNECTION_COLUMN.Row, 'text-xs text-muted-foreground')}>
          <span role='columnheader' className={CONNECTION_COLUMN.Close} />
          <span role='columnheader' className={CONNECTION_COLUMN.Host}>
            Хост и источник
          </span>
          <span role='columnheader' className={CONNECTION_COLUMN.Rule}>
            Правило
          </span>
          <span role='columnheader' className={CONNECTION_COLUMN.Chain}>
            Цепочка
          </span>
          <span role='columnheader' className={CONNECTION_COLUMN.Traffic}>
            Трафик
          </span>
        </div>
      </div>

      <div ref={scrollRef} data-virtual-viewport='' className='min-h-0 grow overflow-y-auto'>
        <div role='rowgroup' className='relative w-full' style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];

            return (
              <div
                key={row.id}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className='absolute inset-x-0 top-0'
                style={{ transform: `translateY(${String(item.start)}px)` }}
              >
                <ConnectionRow
                  connection={row}
                  rowIndex={item.index + 1 + HEADER_ROWS}
                  onClose={closable ? onClose : null}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
