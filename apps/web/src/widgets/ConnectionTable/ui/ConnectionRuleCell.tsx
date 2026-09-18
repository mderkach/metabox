import { useTranslation } from 'react-i18next';

import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionRuleCell({ connection }: ConnectionCellProps) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const rule = connection.rule.length > 0 ? connection.rule : t('row.unconditional');

  return (
    <span className='block truncate font-mono text-xs' title={rule}>
      {rule}
    </span>
  );
}
