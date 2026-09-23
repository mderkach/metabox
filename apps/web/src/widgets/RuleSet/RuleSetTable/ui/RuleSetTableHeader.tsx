import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { RULE_SET_COLUMN } from './RuleSetColumns';

/**
 * Ниже md строка складывается карточкой, и колонки шапки над ней разъезжались
 * бы на три строки: там шапка остаётся только для скринридера.
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
        <span role='columnheader' className={RULE_SET_COLUMN.Tag}>
          {t('column.set')}
        </span>

        <span role='columnheader' className={RULE_SET_COLUMN.Source}>
          {t('ruleSet.source', { ns: 'shared' })}
        </span>

        <span role='columnheader' className={RULE_SET_COLUMN.Usage}>
          {t('column.usage')}
        </span>

        <span role='columnheader' className={RULE_SET_COLUMN.RowActions}>
          <span className='sr-only'>{t('list.rowActions', { ns: 'shared' })}</span>
        </span>
      </div>
    </div>
  );
}
