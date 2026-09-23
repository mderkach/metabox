import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleRow as RuleRowModel } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { RuleRow } from './RuleRow';
import { RuleTableHeader } from './RuleTableHeader';

/** Оценка для первого кадра: точную высоту виртуализатор измеряет сам. */
const ROW_ESTIMATE = 52;
const OVERSCAN = 8;

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/**
 * Список правил в порядке файла: тулбар, шапка колонок, виртуализованные строки
 * и подвал со счётчиком.
 *
 * Сортировки в списке нет и не будет: правила проверяются сверху вниз, и
 * переставленный список показал бы порядок, которого в маршрутизации не
 * существует.
 *
 * Виртуализован — в конфиге бывает до 500 правил, — поэтому таблица
 * собрана ролями, а не тегом `table`: строки позиционируются абсолютно.
 */
export function RuleTable({
  rules,
  total,
  selectedId,
  empty,
  search = null,
  facets = null,
  onSelect,
}: {
  rules: RuleRowModel[];
  /** Сколько правил в конфиге до отбора: подвал сообщает обе величины. */
  total: number;
  selectedId: string | null;
  /** Что показать вместо списка, когда строк нет. */
  empty: ReactNode;
  /** Поиск: левый край тулбара. */
  search?: ReactNode;
  /** Срезы по исходу: вторая строка тулбара. */
  facets?: ReactNode;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('widgets/Rule/RuleTable');
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rules.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
  });

  return (
    <section className={cn('flex min-h-0 grow flex-col overflow-hidden max-lg:min-h-96', SURFACE)}>
      <div className='flex shrink-0 flex-col gap-2 border-b border-border px-3.5 py-2.5'>
        <div className='flex flex-wrap items-center gap-2'>{search}</div>
        {facets}
      </div>

      {rules.length === 0 ? (
        <div className='flex grow items-center justify-center px-4 py-10 text-center'>{empty}</div>
      ) : (
        <div
          ref={scrollRef}
          data-virtual-viewport=''
          role='table'
          aria-label={t('label')}
          aria-rowcount={rules.length + HEADER_ROWS}
          className='min-h-0 grow overflow-y-auto'
        >
          <RuleTableHeader />

          <div role='rowgroup' className='relative' style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const rule = rules[item.index];

              return (
                <div
                  key={rule.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className='absolute inset-x-0 top-0'
                  style={{ transform: `translateY(${String(item.start)}px)` }}
                >
                  <RuleRow
                    rule={rule}
                    rowIndex={item.index + 1 + HEADER_ROWS}
                    selected={rule.id === selectedId}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
        <p role='status'>
          {rules.length === total
            ? t('count.rule', { ns: 'shared', count: total })
            : t('list.shown', { ns: 'shared', shown: rules.length, total })}
        </p>
      </div>
    </section>
  );
}
