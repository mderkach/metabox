import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { RULE_SET_COLUMN } from './RuleSetColumns';

export function RuleSetTableHeader() {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return (
    <div role='rowgroup'>
      <div role='row' aria-rowindex={1} className={cn(RULE_SET_COLUMN.Row, 'bg-muted/30 py-2', TABLE_HEADER)}>
        <span role='columnheader' className={RULE_SET_COLUMN.Tag}>
          {t('column.set')}
        </span>

        <span role='columnheader' className={RULE_SET_COLUMN.Source}>
          {t('column.source')}
        </span>

        <span role='columnheader' className={RULE_SET_COLUMN.Usage}>
          {t('column.usage')}
        </span>

        <span role='columnheader' className={RULE_SET_COLUMN.RowActions}>
          <span className='sr-only'>{t('column.rowActions')}</span>
        </span>
      </div>
    </div>
  );
}
