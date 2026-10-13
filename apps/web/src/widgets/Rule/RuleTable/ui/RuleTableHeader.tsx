import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { RULE_COLUMN } from './RuleColumns';

/**
 * Sticky: there is one scroller, and a header taken out of it would slide out from under the rows.
 * `hits` — whether to show the hits column: without a count it is absent in the rows too.
 */
export function RuleTableHeader({ hits }: { hits: boolean }) {
  const { t } = useTranslation('widgets/Rule/RuleTable');

  return (
    <div role='rowgroup' className='sticky top-0 z-10 bg-card'>
      <div
        role='row'
        aria-rowindex={1}
        className={cn(RULE_COLUMN.Row, 'border-b border-border bg-table-head py-2', TABLE_HEADER)}
      >
        <span role='columnheader' className={RULE_COLUMN.Index}>
          {t('column.index')}
        </span>

        <span role='columnheader' className={RULE_COLUMN.Conditions}>
          {t('rule.conditions', { ns: 'shared' })}
        </span>

        <span role='columnheader' className={RULE_COLUMN.TargetGroup}>
          <span aria-hidden='true' className={RULE_COLUMN.Arrow} />
          <span className={cn(RULE_COLUMN.Target, 'truncate')}>{t('column.target')}</span>
        </span>

        {hits && (
          <span role='columnheader' className={RULE_COLUMN.Hits}>
            {t('column.hits')}
          </span>
        )}
      </div>
    </div>
  );
}
