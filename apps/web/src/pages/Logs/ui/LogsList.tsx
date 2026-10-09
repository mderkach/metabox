import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { LogEntry } from '@entities/Log';
import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { LOGS_COLUMN } from './LogsColumns';
import { LogsRow } from './LogsRow';

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/** Высота строки в одну линию; перенесённое сообщение меряется по факту. */
const ROW_ESTIMATE = 24;

const OVERSCAN = 20;

/**
 * Виртуализованный хвост лога. `follow` держит последнюю строку в окне: новые
 * строки потока прокручивают список к себе, пока пользователь не снял слежение.
 */
export function LogsList({ entries, follow }: { entries: readonly LogEntry[]; follow: boolean }) {
  const { t } = useTranslation('pages/Logs');
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
  });

  useEffect(
    function followTail() {
      if (follow && entries.length > 0) {
        virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
      }
    },
    [entries, follow, virtualizer]
  );

  return (
    <div
      ref={scrollRef}
      data-virtual-viewport=''
      role='table'
      aria-label={t('title')}
      aria-rowcount={entries.length + HEADER_ROWS}
      className='min-h-0 grow overflow-auto'
    >
      <div role='rowgroup' className='sticky top-0 z-10'>
        <div
          role='row'
          aria-rowindex={1}
          className={cn(LOGS_COLUMN.Row, 'bg-table-head py-2 font-sans max-md:sr-only', TABLE_HEADER)}
        >
          <span role='columnheader' className={LOGS_COLUMN.Time}>
            {t('column.time')}
          </span>
          <span role='columnheader' className={LOGS_COLUMN.Level}>
            {t('column.level')}
          </span>
          <span role='columnheader' className={LOGS_COLUMN.Message}>
            {t('column.message')}
          </span>
        </div>
      </div>

      <div role='rowgroup' className='relative' style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            className='absolute inset-x-0 top-0'
            style={{ transform: `translateY(${String(item.start)}px)` }}
          >
            <LogsRow entry={entries[item.index]} rowIndex={item.index + 1 + HEADER_ROWS} />
          </div>
        ))}
      </div>
    </div>
  );
}
