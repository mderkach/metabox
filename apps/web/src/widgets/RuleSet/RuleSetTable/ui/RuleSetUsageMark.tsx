import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { RuleSetUsageValue } from './RuleSetUsageValue';

export function RuleSetUsageMark({ tag, usedBy }: { tag: string; usedBy: number }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  if (tag === '') {
    return <RuleSetUsageValue usedBy={usedBy} />;
  }

  return (
    <Link
      to='/config'
      search={{ rule_set: tag }}
      title={t('row.rules', { tag })}
      className='rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
    >
      <RuleSetUsageValue usedBy={usedBy} />
    </Link>
  );
}
