import { useTranslation } from 'react-i18next';

import { formatBytes } from '@shared/lib/format';

import type { RuleSetCellProps } from './RuleSetColumns';
import { RuleSetUnknownValue } from './RuleSetUnknownValue';

export function RuleSetSizeCell({ set }: RuleSetCellProps) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  if (set.file === null) {
    return <RuleSetUnknownValue />;
  }

  return (
    <span className='text-xs text-muted-foreground'>
      <span className='md:hidden'>{t('column.size')} </span>
      <data value={set.file.size} className='font-mono tabular-nums'>
        {formatBytes(set.file.size)}
      </data>
    </span>
  );
}
