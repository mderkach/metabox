import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { RULE_COLUMN } from './RuleColumns';

/** Липкая: скроллер один, и вынесенная из него шапка уехала бы из-под строк. */
export function RuleTableHeader() {
  const { t } = useTranslation('widgets/Rule/RuleTable');

  return (
    <div role='rowgroup' className='sticky top-0 z-10 bg-card'>
      <div
        role='row'
        aria-rowindex={1}
        className={cn(RULE_COLUMN.Row, 'border-b border-border bg-muted/30 py-2', TABLE_HEADER)}
      >
        <span role='columnheader' className={RULE_COLUMN.Index}>
          {t('column.index')}
        </span>

        <span role='columnheader' className={RULE_COLUMN.Conditions}>
          {t('column.conditions')}
        </span>

        <span role='columnheader' className={RULE_COLUMN.TargetGroup}>
          <span aria-hidden='true' className={RULE_COLUMN.Arrow} />
          <span className={cn(RULE_COLUMN.Target, 'truncate')}>{t('column.target')}</span>
        </span>
      </div>
    </div>
  );
}
