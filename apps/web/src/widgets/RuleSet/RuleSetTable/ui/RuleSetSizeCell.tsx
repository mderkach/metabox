import { useTranslation } from 'react-i18next';

import { formatBytes } from '@shared/lib/format';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetCellProps } from './RuleSetColumns';
import { RuleSetUnknownValue } from './RuleSetUnknownValue';

export function RuleSetSizeCell({ set, cached, showLabel = false }: RuleSetCellProps & { showLabel?: boolean }) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);

  const size = cached?.size ?? set.file?.size;
  if (size === undefined) {
    return <RuleSetUnknownValue />;
  }

  return (
    <span className='text-xs text-muted-foreground'>
      <span className={showLabel ? undefined : 'md:hidden'}>{t('column.size')} </span>
      <data value={size} className='font-mono tabular-nums'>
        {formatBytes(size)}
      </data>
    </span>
  );
}
