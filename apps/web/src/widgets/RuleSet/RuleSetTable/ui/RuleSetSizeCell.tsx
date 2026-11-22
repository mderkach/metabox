import { useTranslation } from 'react-i18next';

import { formatBytes } from '@shared/lib/format';

import type { RuleSetCellProps } from './RuleSetColumns';
import { RuleSetUnknownValue } from './RuleSetUnknownValue';

export function RuleSetSizeCell({ set, cached, showLabel = false }: RuleSetCellProps & { showLabel?: boolean }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

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
