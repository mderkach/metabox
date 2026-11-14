import { useTranslation } from 'react-i18next';

import { formatDateTime } from '@shared/lib/format';

import type { RuleSetCellProps } from './RuleSetColumns';
import { RuleSetUnknownValue } from './RuleSetUnknownValue';

export function RuleSetUpdatedCell({ set }: RuleSetCellProps) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');
  const modifiedAt = set.file?.modifiedAt ?? null;

  if (modifiedAt === null) {
    return <RuleSetUnknownValue />;
  }

  const at = new Date(modifiedAt);

  return (
    <span className='text-xs text-muted-foreground tabular-nums'>
      <span className='md:hidden'>{t('column.updated')} </span>
      <time dateTime={at.toISOString()}>{formatDateTime(at)}</time>
    </span>
  );
}
