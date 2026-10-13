import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { RuleSetRow } from './RuleSetRow';
import { RuleSetTableHeader } from './RuleSetTableHeader';

/** The header row is also a table row: row numbering starts with it. */
const HEADER_ROWS = 1;

/**
 * Attached rule sets in file order: toolbar with search, column header, rows
 * and a footer with a counter. The list holds no forms: a toolbar button opens
 * the form in the panel beside it (ADR-0037).
 *
 * The list is deliberately not virtualized: there are tens of rule sets in a config, not hundreds —
 * a virtualizer here would cost absolute positioning for savings
 * nobody can see. The table is built with roles anyway: the header must name
 * the columns, not only mark them up with styles.
 */
export function RuleSetTable({
  sets,
  total,
  empty,
  search = null,
  actions = null,
  onEdit,
  onRemove,
}: {
  sets: RuleSetRowModel[];
  /** How many rule sets are in the config before filtering: the footer reports both values. */
  total: number;
  /** What to show instead of the list when filtering found nothing. */
  empty: ReactNode;
  /** Search: left edge of the toolbar. */
  search?: ReactNode;
  /** List actions: right edge of the toolbar. */
  actions?: ReactNode;
  /** Opens editing of a rule set; without it rows do not offer editing. */
  onEdit?: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return (
    <section className={cn('flex min-w-0 grow flex-col overflow-hidden', SURFACE)}>
      <h2 className='sr-only'>{t('title')}</h2>

      <div className='flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5'>
        {search}
        {actions !== null && <div className='ml-auto flex items-center gap-2'>{actions}</div>}
      </div>

      {sets.length === 0 ? (
        <div className='flex items-center justify-center px-4 py-10 text-center'>{empty}</div>
      ) : (
        <div role='table' aria-label={t('title')} aria-rowcount={sets.length + HEADER_ROWS}>
          <RuleSetTableHeader />

          <div role='rowgroup'>
            {sets.map((set, position) => (
              <RuleSetRow
                key={set.id}
                set={set}
                rowIndex={position + 1 + HEADER_ROWS}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      )}

      <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
        <p role='status'>
          {sets.length === total
            ? t('footer.rows', { count: total })
            : t('list.shown', { ns: 'shared', shown: sets.length, total })}
        </p>
      </div>
    </section>
  );
}
