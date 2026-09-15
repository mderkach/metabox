import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { useCloseConnection } from '@features/Connection/ConnectionClose';
import { cn } from '@shared/lib/utils';

import { useNow } from '../lib';
import { CONNECTION_COLUMN } from './ConnectionColumns';
import { ConnectionRow } from './ConnectionRow';

/** Оценка для первого кадра: точную высоту виртуализатор измеряет сам. */
const ROW_ESTIMATE = 48;
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
export function ConnectionTable({
  rows,
  closable,
  empty,
  selectedId = null,
  onExplain = null,
}: {
  rows: ConnectionRowModel[];
  closable: boolean;
  /** Что показать вместо таблицы, когда строк нет. */
  empty: ReactNode;
  selectedId?: string | null;
  /** `null` — объяснение маршрута выключено: у демона нет источника рантайма. */
  onExplain?: ((id: string) => void) | null;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = useCloseConnection();
  const now = useNow();

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
      <div className='w-full self-start rounded-xl border border-dashed border-border px-4 py-10 text-center'>
        {empty}
      </div>
    );
  }

  return (
    <div
      role='table'
      aria-label={t('label')}
      aria-rowcount={rows.length + HEADER_ROWS}
      className='flex min-h-0 grow flex-col overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10'
    >
      <div role='rowgroup' className='shrink-0'>
        <div
          role='row'
          aria-rowindex={1}
          className={cn(
            CONNECTION_COLUMN.Row,
            'bg-muted/30 text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase'
          )}
        >
          <span role='columnheader' className={CONNECTION_COLUMN.Host}>
            {t('column.host')}
          </span>
          <span role='columnheader' className={CONNECTION_COLUMN.Route}>
            {t('column.route')}
          </span>
          <span role='columnheader' className={CONNECTION_COLUMN.Traffic}>
            {t('column.traffic')}
          </span>
          <span role='columnheader' className={CONNECTION_COLUMN.Age}>
            {t('column.age')}
          </span>
          <span role='columnheader' className={CONNECTION_COLUMN.Close} />
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
                  now={now}
                  onClose={closable ? onClose : null}
                  onExplain={onExplain}
                  selected={row.id === selectedId}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
