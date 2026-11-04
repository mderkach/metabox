import { useTranslation } from 'react-i18next';

import { Badge } from '@shared/ui';

export function RuleSetUsageValue({ usedBy }: { usedBy: number }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return usedBy === 0 ? (
    <Badge variant='outline' className='border-dashed text-muted-foreground'>
      {t('row.unused')}
    </Badge>
  ) : (
    <span className='text-xs text-muted-foreground tabular-nums'>{t('row.usedBy', { count: usedBy })}</span>
  );
}
