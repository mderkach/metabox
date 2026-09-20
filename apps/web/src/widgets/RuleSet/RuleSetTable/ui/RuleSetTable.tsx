import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { RuleSetRow } from './RuleSetRow';
import { RuleSetTableHeader } from './RuleSetTableHeader';

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/**
 * Подключённые наборы в порядке файла: тулбар с поиском, шапка колонок, строки
 * и подвал со счётчиком.
 *
 * Список не виртуализован намеренно: наборов в конфиге десятки, а не сотни —
 * виртуализатор здесь стоил бы абсолютного позиционирования ради экономии,
 * которой не видно. Ролями таблица собрана всё равно: шапка обязана называть
 * колонки, а не только размечать их стилями.
 */
export function RuleSetTable({
  sets,
  total,
  empty,
  search = null,
  onRemove,
}: {
  sets: RuleSetRowModel[];
  /** Сколько наборов в конфиге до отбора: подвал сообщает обе величины. */
  total: number;
  /** Что показать вместо списка, когда отбор не нашёл ничего. */
  empty: ReactNode;
  /** Поиск: левый край тулбара. */
  search?: ReactNode;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return (
    <section className={cn('flex flex-col overflow-hidden', SURFACE)}>
      <h2 className='sr-only'>{t('title')}</h2>

      <div className='flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5'>{search}</div>

      {sets.length === 0 ? (
        <div className='flex items-center justify-center px-4 py-10 text-center'>{empty}</div>
      ) : (
        <div role='table' aria-label={t('title')} aria-rowcount={sets.length + HEADER_ROWS}>
          <RuleSetTableHeader />

          <div role='rowgroup'>
            {sets.map((set, position) => (
              <RuleSetRow key={set.id} set={set} rowIndex={position + 1 + HEADER_ROWS} onRemove={onRemove} />
            ))}
          </div>
        </div>
      )}

      <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
        <p role='status'>
          {sets.length === total
            ? t('footer.rows', { count: total })
            : t('footer.shown', { shown: sets.length, total })}
        </p>
      </div>
    </section>
  );
}
