import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { RULE_SET_COLUMN, RULE_SET_COLUMNS } from './RuleSetColumns';

/**
 * Below md the row folds into a card, and the header columns above it would spread
 * across three lines: there the header remains for the screen reader only.
 */
export function RuleSetTableHeader() {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return (
    <div role='rowgroup'>
      <div
        role='row'
        aria-rowindex={1}
        className={cn(RULE_SET_COLUMN.Row, 'bg-table-head py-2 max-md:sr-only', TABLE_HEADER)}
      >
        {RULE_SET_COLUMNS.map((def) => (
          <span key={def.id} role='columnheader' className={def.meta.className}>
            {t(def.meta.label)}
          </span>
        ))}

        <span role='columnheader' className={RULE_SET_COLUMN.RowActions}>
          <span className='sr-only'>{t('list.rowActions', { ns: 'shared' })}</span>
        </span>
      </div>
    </div>
  );
}
